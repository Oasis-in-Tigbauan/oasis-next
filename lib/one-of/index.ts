export class Success<T> {
    constructor(public readonly value: T) { }
}

export class Failure<T> {
    constructor(public readonly type: string, public readonly value: T) { }
}

class OneOf<T, F> {
    constructor(private readonly result: Result<T, F>) {}

    match<R>(
        onSuccess: (val: T) => R,
        onFailure: (err: Failure<F>) => R,
    ): R {
        if (this.result instanceof Success) {
            return onSuccess(this.result.value);
        }
        return onFailure(this.result as Failure<F>);
    }
}

export function oneOf<T, F>(result: Result<T, F>) {
    return new OneOf(result);
}

export const failureCodes = {
    ValidationError: "validation_error",
    Invalid: "invalid",
    NotFound: "not_found",
    Fatal: "fatal",
};

type Result<T, F> = Success<T> | Failure<F>;
