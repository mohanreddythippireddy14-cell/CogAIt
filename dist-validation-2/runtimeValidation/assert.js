export function assert(condition, message) {
    if (!condition) {
        throw new Error("ASSERTION FAILED: " + message);
    }
}
