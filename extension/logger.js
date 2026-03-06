const YAB_LOG_PREFIX = "[YAB]";

let _devMode = false;

function yabSetDevMode(enabled) {
  _devMode = enabled;
}

function yabLog(...args) {
  if (_devMode) console.log(YAB_LOG_PREFIX, ...args);
}

function yabWarn(...args) {
  if (_devMode) console.warn(YAB_LOG_PREFIX, ...args);
}

function yabError(...args) {
  console.error(YAB_LOG_PREFIX, ...args);
}
