declare global {
    function acquireVsCodeApi(): {
        getState<T>(): T | undefined;
        setState<T>(newState: T): void;
        postMessage<T>(message: T): void;
    };
}
export {}; // Ensures this file is treated as a module for global
