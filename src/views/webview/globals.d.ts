declare global {
    function acquireVsCodeApi(): {
        getState<T>(): T | undefined;
        setState<T>(newState: T): void;
        postMessage<T>(message: T): void;
    };
}
export {}; // Make this file a module to allow global augmentation
