//! The one door to the device hub (ADR-128). The hub listens on loopback and
//! is never reached directly: it also serves a dashboard, a shell-exec route
//! and WebRTC signalling that no webview should touch. Only the stream and
//! input routes the Devices pane needs pass through here, unchanged:
//!
//! - `GET /vendor/serve-sim/helper/<udid>/stream.avcc` (H.264 envelopes),
//!   `…/stream.mjpeg` (fallback), `…/config`, `…/health`;
//! - the input WebSocket `/vendor/serve-sim/helper/ws?device=<udid>`.
//!
//! The desktop webview reaches this through a loopback listener of its own
//! (a random port and a per-launch token, checked in constant time, plus an
//! `Origin` check); the remote server (ADR-080) mounts the same `forward`
//! under `/api/device-hub/` behind a paired device's token. Bodies stream
//! chunk by chunk and WebSocket frames are relayed as they come, both with
//! Nagle off, so the proxy adds no buffering.

use std::net::{Ipv4Addr, SocketAddr};

use axum::body::Body;
use axum::extract::ws::{
    rejection::WebSocketUpgradeRejection, Message, WebSocket, WebSocketUpgrade,
};
use axum::extract::ConnectInfo;
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::serve::ListenerExt;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite;

use crate::error::Result;

/// Webview origins allowed to use the local proxy (production, Windows-style and dev).
const ORIGINS: &[&str] = &[
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
];
const STREAM_FILES: &[&str] = &["stream.avcc", "stream.mjpeg", "config", "health"];
/// Input packets are small JSON; screen config replies too.
const MAX_SOCKET_MESSAGE: usize = 1024 * 1024;

/// A simulator UDID (`8A1C…-…`): hex digits and dashes only.
pub fn valid_udid(value: &str) -> bool {
    (8..=64).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

/// The hub path (and query) for an allowed request, or `None`.
pub fn upstream(path: &str, query: Option<&str>, socket: bool) -> Option<String> {
    if socket {
        if path != "/vendor/serve-sim/helper/ws" {
            return None;
        }
        let device = query?
            .split('&')
            .filter_map(|pair| pair.split_once('='))
            .find(|(key, _)| *key == "device")
            .map(|(_, value)| value)?;
        return valid_udid(device).then(|| format!("{path}?device={device}"));
    }
    let rest = path.strip_prefix("/vendor/serve-sim/helper/")?;
    let (udid, file) = rest.split_once('/')?;
    (valid_udid(udid) && STREAM_FILES.contains(&file))
        .then(|| format!("/vendor/serve-sim/helper/{udid}/{file}"))
}

/// Relays one allowed request to the running hub.
pub async fn forward(
    path: &str,
    query: Option<&str>,
    method: &Method,
    upgrade: Option<WebSocketUpgrade>,
) -> Response {
    if method != Method::GET {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    let Some(upstream) = upstream(path, query, upgrade.is_some()) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(origin) = super::hub_origin() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "The device hub is not running.",
        )
            .into_response();
    };
    if let Some(upgrade) = upgrade {
        let url = format!("{}{upstream}", origin.replacen("http://", "ws://", 1));
        return upgrade
            .max_message_size(MAX_SOCKET_MESSAGE)
            .on_upgrade(move |socket| relay(socket, url));
    }
    let response = match super::hub::http()
        .get(format!("{origin}{upstream}"))
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            tracing::debug!(%error, "device hub request failed");
            return StatusCode::BAD_GATEWAY.into_response();
        }
    };
    let status =
        StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| HeaderValue::from_bytes(value.as_bytes()).ok());
    // Chunks go out as the hub writes them; dropping the body (the pane went
    // away) drops the upstream response and closes the hub's stream.
    let body = futures_util::stream::unfold(Some(response), |state| async move {
        let mut response = state?;
        match response.chunk().await {
            Ok(Some(bytes)) => Some((Ok::<_, std::io::Error>(bytes), Some(response))),
            Ok(None) => None,
            Err(error) => Some((Err(std::io::Error::other(error)), None)),
        }
    });
    let mut reply = Response::new(Body::from_stream(body));
    *reply.status_mut() = status;
    let headers = reply.headers_mut();
    if let Some(content_type) = content_type {
        headers.insert(header::CONTENT_TYPE, content_type);
    }
    // Long-lived MJPEG and H.264 bodies must not be buffered or compressed on the way.
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store, no-transform"),
    );
    headers.insert(
        header::CONTENT_ENCODING,
        HeaderValue::from_static("identity"),
    );
    reply
}

/// Pipes the webview's socket to the hub's, frame for frame, until either side closes.
async fn relay(mut client: WebSocket, url: String) {
    let upstream = match tokio_tungstenite::connect_async_with_config(&url, None, true).await {
        Ok((socket, _)) => socket,
        Err(error) => {
            tracing::debug!(%error, "device hub socket refused");
            let _ = client.close().await;
            return;
        }
    };
    let (mut to_hub, mut from_hub) = upstream.split();
    let (mut to_client, mut from_client) = client.split();
    let up = async {
        while let Some(Ok(message)) = from_client.next().await {
            let message = match message {
                Message::Binary(bytes) => tungstenite::Message::Binary(bytes),
                Message::Text(text) => tungstenite::Message::text(text.as_str()),
                Message::Close(_) => break,
                Message::Ping(_) | Message::Pong(_) => continue,
            };
            if to_hub.send(message).await.is_err() {
                break;
            }
        }
        let _ = to_hub.close().await;
    };
    let down = async {
        while let Some(Ok(message)) = from_hub.next().await {
            let message = match message {
                tungstenite::Message::Binary(bytes) => Message::Binary(bytes),
                tungstenite::Message::Text(text) => Message::Text(text.as_str().into()),
                tungstenite::Message::Close(_) => break,
                _ => continue,
            };
            if to_client.send(message).await.is_err() {
                break;
            }
        }
        let _ = to_client.close().await;
    };
    tokio::select! {
        () = up => {}
        () = down => {}
    }
}

/// Starts the webview's loopback proxy on a free port; returns `(port, token)`.
pub async fn start_local() -> Result<(u16, String)> {
    let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let port = listener.local_addr()?.port();
    let token = crate::remote::random_token(32);
    let expected = token.clone();
    let router = Router::new().fallback(
        move |ConnectInfo(peer): ConnectInfo<SocketAddr>,
              method: Method,
              uri: Uri,
              headers: HeaderMap,
              upgrade: std::result::Result<WebSocketUpgrade, WebSocketUpgradeRejection>| {
            let expected = expected.clone();
            async move { local(peer, method, uri, headers, upgrade.ok(), &expected).await }
        },
    );
    let listener = listener.tap_io(|stream| {
        let _ = stream.set_nodelay(true);
    });
    tauri::async_runtime::spawn(async move {
        let served = axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await;
        if let Err(error) = served {
            tracing::warn!(%error, "device proxy stopped");
        }
    });
    Ok((port, token))
}

async fn local(
    peer: SocketAddr,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    upgrade: Option<WebSocketUpgrade>,
    expected: &str,
) -> Response {
    if !peer.ip().is_loopback() {
        return StatusCode::FORBIDDEN.into_response();
    }
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    if origin.is_some_and(|origin| !ORIGINS.contains(&origin)) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if !token_matches(uri.query(), expected) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut response = forward(uri.path(), uri.query(), &method, upgrade).await;
    if let Some(origin) = origin.and_then(|origin| HeaderValue::from_str(origin).ok()) {
        // The webview's `fetch` is cross-origin (tauri://localhost → 127.0.0.1).
        let headers = response.headers_mut();
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        headers.insert(header::VARY, HeaderValue::from_static("Origin"));
    }
    response
}

/// `token=<value>` in the query, compared in constant time.
pub fn token_matches(query: Option<&str>, expected: &str) -> bool {
    let token = query
        .unwrap_or_default()
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find(|(key, _)| *key == "token")
        .map(|(_, value)| value)
        .unwrap_or_default();
    !token.is_empty() && crate::browser_mcp::constant_time_eq(token.as_bytes(), expected.as_bytes())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    const UDID: &str = "E1475EFE-B49D-4FCB-B780-7C3D2B8D5BEA";

    #[test]
    fn only_stream_and_input_routes_pass() {
        assert_eq!(
            upstream(
                &format!("/vendor/serve-sim/helper/{UDID}/stream.avcc"),
                Some("token=x"),
                false
            )
            .as_deref(),
            Some(format!("/vendor/serve-sim/helper/{UDID}/stream.avcc").as_str()),
            "the query (with the token) never reaches the hub"
        );
        for file in ["stream.mjpeg", "config", "health"] {
            assert!(upstream(
                &format!("/vendor/serve-sim/helper/{UDID}/{file}"),
                None,
                false
            )
            .is_some());
        }
        for path in [
            "/",
            "/api/devices",
            "/api/devices/boot",
            "/vendor/serve-sim/exec",
            "/vendor/serve-sim/api",
            "/vendor/serve-sim/grid/api/start",
            "/vendor/serve-sim/helper/../exec/stream.avcc",
            "/vendor/serve-emu/ws",
            "/vendor/serve-sim/helper/ws",
        ] {
            assert_eq!(upstream(path, None, false), None, "{path}");
        }
        assert_eq!(
            upstream(
                &format!("/vendor/serve-sim/helper/{UDID}/stream.avcc/x"),
                None,
                false
            ),
            None
        );
    }

    #[test]
    fn the_input_socket_keeps_only_a_valid_device() {
        assert_eq!(
            upstream(
                "/vendor/serve-sim/helper/ws",
                Some(&format!("token=t&device={UDID}&x=1")),
                true
            )
            .as_deref(),
            Some(format!("/vendor/serve-sim/helper/ws?device={UDID}").as_str())
        );
        assert_eq!(
            upstream("/vendor/serve-sim/helper/ws", Some("device=a%26b"), true),
            None
        );
        assert_eq!(upstream("/vendor/serve-sim/helper/ws", None, true), None);
        assert_eq!(
            upstream(
                "/vendor/serve-emu/ws",
                Some(&format!("device={UDID}")),
                true
            ),
            None
        );
        assert_eq!(
            upstream(
                &format!("/vendor/serve-sim/helper/{UDID}/stream.avcc"),
                None,
                true
            ),
            None
        );
    }

    #[test]
    fn tokens_must_match_exactly() {
        assert!(token_matches(Some("token=abc&device=1"), "abc"));
        assert!(!token_matches(Some("token=abd"), "abc"));
        assert!(!token_matches(Some("token="), ""));
        assert!(!token_matches(None, "abc"));
    }

    /// Against a real hub with an attached simulator:
    /// `SIRUS_DEVICE_HUB_ORIGIN=http://127.0.0.1:<port> SIRUS_DEVICE_HUB_UDID=<udid> cargo test devices::proxy -- --ignored`.
    #[test]
    #[ignore = "needs a running expo-device-hub and a booted simulator"]
    fn relays_a_real_hub() {
        let origin = std::env::var("SIRUS_DEVICE_HUB_ORIGIN").expect("SIRUS_DEVICE_HUB_ORIGIN");
        let udid = std::env::var("SIRUS_DEVICE_HUB_UDID").expect("SIRUS_DEVICE_HUB_UDID");
        let _ = super::super::TEST_HUB_ORIGIN.set(origin);
        tauri::async_runtime::block_on(check_real_relay(&udid));
    }

    /// The relay checks, shared with the install-and-run test in `devices`.
    pub(crate) async fn check_real_relay(udid: &str) {
        {
            let (port, token) = start_local().await.unwrap();
            let base = format!("http://127.0.0.1:{port}");
            let client = reqwest::Client::builder().no_proxy().build().unwrap();
            let get = |path: String, origin: &'static str| {
                client
                    .get(format!("{base}{path}"))
                    .header("Origin", origin)
                    .send()
            };
            let status = |path: &str, origin: &'static str| {
                let request = get(path.to_string(), origin);
                async move { request.await.unwrap().status().as_u16() }
            };
            assert_eq!(
                status(
                    &format!("/vendor/serve-sim/helper/{udid}/config"),
                    "tauri://localhost"
                )
                .await,
                401
            );
            assert_eq!(
                status(&format!("/api/devices?token={token}"), "tauri://localhost").await,
                404
            );
            assert_eq!(
                status(
                    &format!("/vendor/serve-sim/exec?token={token}"),
                    "tauri://localhost"
                )
                .await,
                404
            );
            assert_eq!(
                status(
                    &format!("/vendor/serve-sim/helper/{udid}/config?token={token}"),
                    "https://evil.example"
                )
                .await,
                403
            );
            let config = get(
                format!("/vendor/serve-sim/helper/{udid}/config?token={token}"),
                "tauri://localhost",
            )
            .await
            .unwrap();
            assert_eq!(
                config.headers()["access-control-allow-origin"],
                "tauri://localhost"
            );
            let config: serde_json::Value =
                serde_json::from_str(&config.text().await.unwrap()).unwrap();
            assert!(config["width"].is_number(), "{config}");

            // The H.264 body streams through as length-prefixed envelopes.
            let mut stream = get(
                format!("/vendor/serve-sim/helper/{udid}/stream.avcc?token={token}"),
                "tauri://localhost",
            )
            .await
            .unwrap();
            assert_eq!(stream.headers()["content-encoding"], "identity");
            let mut bytes = Vec::new();
            let started = std::time::Instant::now();
            while bytes.len() < 8 && started.elapsed() < std::time::Duration::from_secs(10) {
                if let Ok(Ok(Some(chunk))) =
                    tokio::time::timeout(std::time::Duration::from_secs(10), stream.chunk()).await
                {
                    bytes.extend_from_slice(&chunk);
                }
            }
            let tag = bytes[4];
            assert!((1..=4).contains(&tag), "first envelope tag {tag}");
            drop(stream);

            // The input socket relays the helper's admission and screen config.
            let (mut socket, _) = tokio_tungstenite::connect_async(format!(
                "ws://127.0.0.1:{port}/vendor/serve-sim/helper/ws?device={udid}&token={token}"
            ))
            .await
            .unwrap();
            let mut tags = Vec::new();
            while tags.len() < 2 {
                let message =
                    tokio::time::timeout(std::time::Duration::from_secs(10), socket.next())
                        .await
                        .expect("hub reply")
                        .unwrap()
                        .unwrap();
                if let tungstenite::Message::Binary(bytes) = message {
                    tags.push(bytes[0]);
                }
            }
            assert!(tags.contains(&0x83) || tags.contains(&0x82), "{tags:?}");
        }
    }

    #[test]
    fn udids_are_hex_and_dashes() {
        assert!(valid_udid(UDID));
        assert!(!valid_udid("../../etc"));
        assert!(!valid_udid("short"));
    }
}
