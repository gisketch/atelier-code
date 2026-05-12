use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::process::Command;
use std::time::Duration;

const DAEMON_ENDPOINT: &str = "http://127.0.0.1:17345";

#[derive(Serialize)]
struct DaemonStatus {
    reachable: bool,
    endpoint: &'static str,
    detail: String,
}

#[derive(Serialize)]
struct DaemonStartStatus {
    started: bool,
    endpoint: &'static str,
    detail: String,
}

#[tauri::command]
fn daemon_status() -> DaemonStatus {
    let address = SocketAddr::from(([127, 0, 0, 1], 17345));
    let mut stream = match TcpStream::connect_timeout(&address, Duration::from_millis(350)) {
        Ok(stream) => stream,
        Err(error) => {
            return DaemonStatus {
                reachable: false,
                endpoint: DAEMON_ENDPOINT,
                detail: error.to_string(),
            }
        }
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(350)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(350)));

    if let Err(error) = stream.write_all(
        b"GET /health HTTP/1.1\r\nHost: 127.0.0.1:17345\r\nConnection: close\r\n\r\n",
    ) {
        return DaemonStatus {
            reachable: false,
            endpoint: DAEMON_ENDPOINT,
            detail: error.to_string(),
        };
    }

    let mut response = String::new();
    match stream.read_to_string(&mut response) {
        Ok(_) if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") => {
            DaemonStatus {
                reachable: true,
                endpoint: DAEMON_ENDPOINT,
                detail: "Daemon health endpoint responded".to_string(),
            }
        }
        Ok(_) => DaemonStatus {
            reachable: false,
            endpoint: DAEMON_ENDPOINT,
            detail: "Daemon returned a non-200 response".to_string(),
        },
        Err(error) => DaemonStatus {
            reachable: false,
            endpoint: DAEMON_ENDPOINT,
            detail: error.to_string(),
        },
    }
}

#[tauri::command]
fn daemon_endpoint() -> &'static str {
    DAEMON_ENDPOINT
}

#[tauri::command]
fn daemon_start() -> DaemonStartStatus {
    let status = daemon_status();
    if status.reachable {
        return DaemonStartStatus {
            started: false,
            endpoint: DAEMON_ENDPOINT,
            detail: "Daemon already reachable".to_string(),
        };
    }

    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().unwrap_or(manifest_dir);
    let mut command = Command::new("bun");
    command
        .current_dir(repo_root)
        .arg("run")
        .arg("src/daemon/main.ts");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    match command.spawn() {
        Ok(_) => DaemonStartStatus {
            started: true,
            endpoint: DAEMON_ENDPOINT,
            detail: "Daemon launch requested".to_string(),
        },
        Err(error) => DaemonStartStatus {
            started: false,
            endpoint: DAEMON_ENDPOINT,
            detail: error.to_string(),
        },
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            daemon_status,
            daemon_endpoint,
            daemon_start
        ])
        .run(tauri::generate_context!())
        .expect("error while running Atelier");
}
