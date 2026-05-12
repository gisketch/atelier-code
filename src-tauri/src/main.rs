use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

const DAEMON_ENDPOINT: &str = "http://127.0.0.1:17345";

#[derive(Serialize)]
struct DaemonStatus {
    reachable: bool,
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![daemon_status])
        .run(tauri::generate_context!())
        .expect("error while running Atelier");
}

