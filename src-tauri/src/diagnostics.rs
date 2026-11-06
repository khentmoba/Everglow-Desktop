//! Release builds have no console, so failures are also appended to a log beside the app data.
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_LOG_BYTES: u64 = 512 * 1024;
const MAX_DETAIL_CHARS: usize = 240;

struct Log {
    path: PathBuf,
    last: Option<String>,
}

static LOG: OnceLock<Mutex<Log>> = OnceLock::new();

macro_rules! log_error {
    ($($arg:tt)*) => {
        $crate::diagnostics::record(&format!($($arg)*))
    };
}

pub fn init(path: PathBuf) {
    let _ = LOG.set(Mutex::new(Log { path, last: None }));
}

pub fn record(message: &str) {
    eprintln!("{message}");
    let Some(log) = LOG.get() else { return };
    let Ok(mut log) = log.lock() else { return };
    // Unix seconds keep the format dependency-free; support can convert them.
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs());
    log.last = Some(message.chars().take(MAX_DETAIL_CHARS).collect());
    if fs::metadata(&log.path).is_ok_and(|meta| meta.len() > MAX_LOG_BYTES) {
        let _ = fs::rename(&log.path, log.path.with_extension("log.1"));
    }
    let _ = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log.path)
        .and_then(|mut file| writeln!(file, "{seconds} {message}"));
}

pub fn last_error() -> Option<String> {
    LOG.get()?.lock().ok()?.last.clone()
}
