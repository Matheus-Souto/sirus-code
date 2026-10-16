//! Claude workflows (ADR-115). A workflow run is a task with
//! `task_type: "local_workflow"`; each `task_progress` of it carries a full
//! `workflow_progress` snapshot of its phases and member agents. Snapshots are merged so a
//! late or partial frame never moves a member backwards or drops a phase.
use serde::{Deserialize, Serialize};
use serde_json::Value;

const MAX_PHASES: usize = 64;
const MAX_AGENTS: usize = 256;
const MAX_LABEL: usize = 120;
const MAX_RESULT: usize = 400;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default)]
    pub phases: Vec<Phase>,
    #[serde(default)]
    pub agents: Vec<Agent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Phase {
    pub index: u32,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub index: u32,
    pub label: String,
    /// `queued`, `running`, `completed` or `failed`.
    pub state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase_index: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attempt: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
}

fn short(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

fn count(value: &Value) -> Option<u64> {
    value.as_u64().filter(|n| *n <= 9_007_199_254_740_991)
}

/// `queued→queued`, `start→running`, `done→completed`, `error→failed`. Unknown states read as
/// running: a wrong "running" corrects itself on the next frame, a wrong "completed" would not.
fn state(value: &Value) -> &'static str {
    match value.as_str() {
        Some("queued") => "queued",
        Some("done") => "completed",
        Some("error") => "failed",
        _ => "running",
    }
}

/// The snapshot in a `task_progress` frame; `None` when the frame has none.
pub fn snapshot(frame: &Value) -> Option<Workflow> {
    let entries = frame["workflow_progress"]
        .as_array()
        .filter(|entries| !entries.is_empty())?;
    let mut workflow = Workflow::default();
    for entry in entries {
        let Some(index) = entry["index"].as_u64().and_then(|n| u32::try_from(n).ok()) else {
            continue;
        };
        match entry["type"].as_str() {
            Some("workflow_phase") if workflow.phases.len() < MAX_PHASES => {
                if let Some(title) = entry["title"].as_str() {
                    workflow.phases.push(Phase {
                        index,
                        title: short(title, MAX_LABEL),
                    });
                }
            }
            Some("workflow_agent") if workflow.agents.len() < MAX_AGENTS => {
                let Some(label) = entry["label"].as_str() else {
                    continue;
                };
                workflow.agents.push(Agent {
                    index,
                    label: short(label, MAX_LABEL),
                    state: state(&entry["state"]).into(),
                    phase_index: entry["phaseIndex"]
                        .as_u64()
                        .and_then(|n| u32::try_from(n).ok()),
                    model: entry["model"].as_str().map(|model| short(model, MAX_LABEL)),
                    attempt: entry["attempt"]
                        .as_u64()
                        .and_then(|n| u32::try_from(n).ok()),
                    tokens: count(&entry["tokens"]),
                    tool_calls: count(&entry["toolCalls"]),
                    duration_ms: count(&entry["durationMs"]),
                    result: entry["resultPreview"]
                        .as_str()
                        .map(|text| short(text, MAX_RESULT)),
                });
            }
            _ => {}
        }
    }
    Some(workflow)
}

fn settled(state: &str) -> bool {
    matches!(state, "completed" | "failed")
}

/// Merges a new snapshot into what is known: phases are only added; a member never goes
/// back (finished to anything else, running to queued) unless a new attempt restarted it,
/// and a stale attempt is dropped.
pub fn merge(prior: &Workflow, next: Workflow) -> Workflow {
    let mut merged = prior.clone();
    if next.name.is_some() {
        merged.name = next.name;
    }
    for phase in next.phases {
        if let Some(known) = merged
            .phases
            .iter_mut()
            .find(|known| known.index == phase.index)
        {
            *known = phase;
        } else if merged.phases.len() < MAX_PHASES {
            merged.phases.push(phase);
        }
    }
    for agent in next.agents {
        let Some(known) = merged
            .agents
            .iter_mut()
            .find(|known| known.index == agent.index)
        else {
            if merged.agents.len() < MAX_AGENTS {
                merged.agents.push(agent);
            }
            continue;
        };
        let attempt = agent.attempt.unwrap_or(1);
        let previous = known.attempt.unwrap_or(1);
        if attempt < previous {
            continue;
        }
        let restarted = attempt > previous;
        let regressed = !restarted
            && ((settled(&known.state) && agent.state != known.state)
                || (known.state == "running" && agent.state == "queued"));
        if regressed {
            continue;
        }
        let phase_index = if restarted { known.phase_index } else { None };
        let result = agent.result.clone().or(known.result.take());
        *known = Agent {
            phase_index: agent.phase_index.or(phase_index).or(known.phase_index),
            result,
            ..agent
        };
    }
    merged.phases.sort_by_key(|phase| phase.index);
    merged.agents.sort_by_key(|agent| agent.index);
    merged
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn frame(agents: Value) -> Value {
        json!({"type":"system","subtype":"task_progress","task_id":"w1","workflow_progress": agents})
    }

    #[test]
    fn snapshots_read_phases_and_members_with_bounded_fields() {
        let workflow = snapshot(&frame(json!([
            {"type":"workflow_phase","index":1,"title":"Alpha"},
            {"type":"workflow_agent","index":1,"label":"alpha:one","state":"start","phaseIndex":1,"model":"claude-opus-5","attempt":2,"tokens":71141,"toolCalls":3,"durationMs":1277,"resultPreview":"A1"},
            {"type":"workflow_agent","index":2,"label":"alpha:two","state":"mystery"},
            {"type":"workflow_agent","label":"no index"}
        ])))
        .unwrap();
        assert_eq!(
            workflow.phases,
            vec![Phase {
                index: 1,
                title: "Alpha".into()
            }]
        );
        assert_eq!(workflow.agents.len(), 2);
        assert_eq!(workflow.agents[0].state, "running");
        assert_eq!(workflow.agents[0].tokens, Some(71141));
        assert_eq!(
            workflow.agents[1].state, "running",
            "unknown reads as running"
        );
        assert!(snapshot(&json!({"type":"system","subtype":"task_progress","usage":{}})).is_none());
    }

    #[test]
    fn a_workflow_task_becomes_a_child_row_that_merges_its_snapshots() {
        let start = json!({"type":"system","subtype":"task_started","task_id":"w1","tool_use_id":"call","description":"Review","task_type":"local_workflow","workflow_name":"probe-wf"});
        assert!(crate::activity::is_workflow_task(&start));
        let mut activity =
            crate::activity::TurnActivity::new(crate::models::AgentProviderId::Claude, None);
        for item in crate::activity::claude(&start) {
            activity.observe(item);
        }
        let progress = frame(json!([
            {"type":"workflow_phase","index":1,"title":"Alpha"},
            {"type":"workflow_agent","index":1,"label":"one","state":"done","phaseIndex":1}
        ]));
        for item in crate::activity::claude(&progress) {
            activity.observe(item);
        }
        let later =
            frame(json!([{"type":"workflow_agent","index":1,"label":"one","state":"start"}]));
        for item in crate::activity::claude(&later) {
            activity.observe(item);
        }
        let row = &activity.items[0];
        assert_eq!(row.label, "probe-wf");
        let workflow = row.workflow.as_ref().unwrap();
        assert_eq!(workflow.phases.len(), 1);
        assert_eq!(workflow.agents[0].state, "completed");
    }

    #[test]
    fn merging_never_moves_members_back_or_drops_phases() {
        let first = snapshot(&frame(json!([
            {"type":"workflow_phase","index":1,"title":"Alpha"},
            {"type":"workflow_phase","index":2,"title":"Beta"},
            {"type":"workflow_agent","index":1,"label":"one","state":"done","phaseIndex":1,"resultPreview":"ok"},
            {"type":"workflow_agent","index":2,"label":"two","state":"start","phaseIndex":2}
        ])))
        .unwrap();
        let late = snapshot(&frame(json!([
            {"type":"workflow_phase","index":1,"title":"Alpha"},
            {"type":"workflow_agent","index":1,"label":"one","state":"start"},
            {"type":"workflow_agent","index":2,"label":"two","state":"queued"},
            {"type":"workflow_agent","index":3,"label":"three","state":"queued"}
        ])))
        .unwrap();
        let merged = merge(&first, late);
        assert_eq!(merged.phases.len(), 2, "a phase is never dropped");
        assert_eq!(
            merged.agents[0].state, "completed",
            "a finished member stays finished"
        );
        assert_eq!(
            merged.agents[1].state, "running",
            "running never goes back to queued"
        );
        assert_eq!(merged.agents[2].state, "queued");
        let retry = snapshot(&frame(json!([
            {"type":"workflow_agent","index":1,"label":"one","state":"start","attempt":2}
        ])))
        .unwrap();
        let merged = merge(&merged, retry);
        assert_eq!(
            merged.agents[0].state, "running",
            "a new attempt restarts it"
        );
        assert_eq!(merged.agents[0].phase_index, Some(1), "and keeps its phase");
        let stale = snapshot(&frame(json!([
            {"type":"workflow_agent","index":1,"label":"one","state":"error","attempt":1}
        ])))
        .unwrap();
        assert_eq!(
            merge(&merged, stale).agents[0].state,
            "running",
            "a stale attempt is dropped"
        );
    }
}
