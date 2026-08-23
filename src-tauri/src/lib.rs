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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, write_gpx_file, read_gpx_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
