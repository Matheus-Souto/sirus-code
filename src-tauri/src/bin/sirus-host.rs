//! `sirus-host`: Sirus Code without a window, for a Linux server (ADR-131).
//! Build with `cargo build --release --no-default-features --features host --bin sirus-host`.

#[cfg(not(feature = "desktop"))]
fn main() {
    std::process::exit(sirus_code_lib::run_host());
}

#[cfg(feature = "desktop")]
fn main() {
    eprintln!("sirus-host is built without the desktop app: --no-default-features --features host");
    std::process::exit(2);
}
