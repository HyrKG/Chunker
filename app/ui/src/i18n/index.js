import {en} from "./locales/en";
import {zh} from "./locales/zh";

let messages = {en, zh};

const STORAGE_KEY = "chunker.language";
const DEFAULT_LANGUAGE = "zh";

let currentLanguage = DEFAULT_LANGUAGE;
try {
    let stored = localStorage.getItem(STORAGE_KEY);
    if (stored && messages[stored]) {
        currentLanguage = stored;
    }
} catch (e) {
    // localStorage may be unavailable (e.g. sandboxed)
}

let listeners = new Set();

// Set the initial document language
if (typeof document !== "undefined") {
    document.documentElement.lang = currentLanguage;
}

/**
 * Resolve a dotted key (e.g. "select.title") against an object.
 * Returns undefined if not found.
 */
function resolveKey(obj, key) {
    let parts = key.split(".");
    let current = obj;
    for (let part of parts) {
        if (current === null || current === undefined || typeof current !== "object") {
            return undefined;
        }
        current = current[part];
    }
    return current;
}

/**
 * Interpolate {param} placeholders in a string.
 */
function interpolate(template, params) {
    if (!params || typeof template !== "string") return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => {
        return params[name] !== undefined ? params[name] : match;
    });
}

/**
 * Translate a key.
 *
 * @param {string} key - Dotted key, e.g. "select.title"
 * @param {Object} [params] - Interpolation params, e.g. {n: 3} for "区域 {n}"
 * @param {string} [fallback] - Value returned if the key is missing in both the
 *   current language and the English fallback. Defaults to the key itself.
 * @returns {string}
 */
export function t(key, params, fallback) {
    let value = resolveKey(messages[currentLanguage], key);
    if (value === undefined) {
        // Fall back to English
        value = resolveKey(messages.en, key);
    }
    if (value === undefined) {
        return fallback !== undefined ? fallback : key;
    }
    return interpolate(value, params);
}

/**
 * Change the active language, persist it, and notify subscribers.
 */
export function setLanguage(lang) {
    if (!messages[lang] || lang === currentLanguage) return;
    currentLanguage = lang;
    try {
        localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
        // Ignore persistence failures
    }
    if (typeof document !== "undefined") {
        document.documentElement.lang = lang;
    }
    listeners.forEach(fn => fn());
}

export function getLanguage() {
    return currentLanguage;
}

export function getAvailableLanguages() {
    return [
        {code: "zh", label: "中文"},
        {code: "en", label: "English"}
    ];
}

/**
 * Subscribe to language changes. Returns an unsubscribe function.
 */
export function subscribe(fn) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}
