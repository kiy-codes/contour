// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// The fs plugin's ACL scopes writes/reads to a fixed set of well-known
// directories and has no "any path the user just picked in a native dialog"
// scope in v2 (the old v1 dialog-scope feature doesn't exist for this
// plugin). Since the path always originates from the trusted native
// save/open dialog — the user explicitly chose that exact location — a
// plain custom command is the appropriate boundary here rather than fighting
// the plugin's directory allowlist.
#[tauri::command]
fn write_gpx_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_gpx_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// See tileCacheProtocol.ts's ORIGIN_SPOOF_HOSTS: some tile CDNs (OpenSkiMap's)
// serve a near-empty anti-hotlink placeholder unless the request carries an
// Origin header they recognise. The JS-side @tauri-apps/plugin-http fetch()
// builds its request through a browser Request/Headers object first, and on
// Android that object silently strips "Origin" (a spec-forbidden header
// name) before the request reaches this process at all — confirmed via an
// on-device diagnostic showing the exact 193-byte placeholder every time,
// despite the header being set in JS. A raw reqwest call has no such
// restriction, since it isn't a browser-spec object at all.
#[tauri::command]
async fn fetch_with_origin_header(url: String, origin: String) -> Result<Vec<u8>, String> {
    let response = reqwest::Client::new()
        .get(&url)
        .header("Origin", origin)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    response
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_geolocation::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            write_gpx_file,
            read_gpx_file,
            fetch_with_origin_header
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
