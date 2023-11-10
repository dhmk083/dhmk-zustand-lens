import type {
  StateCreator,
  StoreMutatorIdentifier,
  StoreApi,
  Mutate,
} from "zustand/vanilla";

import {
  getIn,
  setIn,
  shallowEqual,
  isPlainObject,
  PropType,
} from "@dhmk/utils";

export { mergeDeep } from "@dhmk/utils";

export type Setter<T> = (
  partial: Partial<T> | ((state: T) => Partial<T> | void),
  replace?: boolean | undefined,
  ...args
) => void;

export type Getter<T> = () => T;

type SetState<T> = StoreApi<T>["setState"];

export function createLens<T, P extends string[]>(
  set: SetState<T>,
  get: Getter<T>,
  path: [...P]
): [Setter<PropType<T, P>>, Getter<PropType<T, P>>];
export function createLens<T, P extends string>(
  set: SetState<T>,
  get: Getter<T>,
  path: P
): [Setter<PropType<T, [P]>>, Getter<PropType<T, [P]>>];
export function createLens<T, P extends string[]>(
  set: Setter<T>,
  get: Getter<T>,
  path: [...P]
): [Setter<PropType<T, P>>, Getter<PropType<T, P>>];
export function createLens<T, P extends string>(
  set: Setter<T>,
  get: Getter<T>,
  path: P
): [Setter<PropType<T, [P]>>, Getter<PropType<T, [P]>>];
export function createLens(set, get, path) {
  const normPath = typeof path === "string" ? [path] : path;

  const _set = (partial, replace, ...args) =>
    set(
      (parentValue) => {
        const ourOldValue: any = getIn(parentValue, normPath);
        const ourTmpValue =
          typeof partial === "function" ? partial(ourOldValue) : partial;
        const isPlain = isPlainObject(ourOldValue);
        const ourNextValue =
          replace || !isPlain
            ? ourTmpValue
            : { ...ourOldValue, ...ourTmpValue };

        const isSame = isPlain
          ? shallowEqual(ourOldValue as any, ourNextValue)
          : ourOldValue === ourNextValue; // todo Object.is

        return isSame
          ? parentValue
          : setIn(parentValue, normPath, ourNextValue);
      },
      false,
      ...args
    );

  const _get = () => getIn(get(), normPath);

  return [_set, _get] as any;
}

const LENS_TAG = "@dhmk/LENS_TAG";

const isLens = (x): x is LensCreator<any> => !!x && x[LENS_TAG];

type LensCreator<T> = {
  (set, get, api, path): T;
  [LENS_TAG]: true;
};

// https://stackoverflow.com/a/55541672
type IsAny<T> = 0 extends 1 & T ? true : false;

export type ResolveStoreApi<X> = IsAny<X> extends true
  ? StoreApi<any>
  : X extends StoreApi<any>
  ? X
  : X extends unknown
  ? StoreApi<X>
  : unknown;

class LensTypeInfo<T, S> {
  protected __lensType?: T;
  protected __lensStoreApi?: (lensStoreApi: S) => void;
}

type LensOpaqueType<T, S> = T & LensTypeInfo<T, ResolveStoreApi<S>>;

export type Lens<T, S = unknown, Setter_ extends Setter<T> = Setter<T>> = (
  set: Setter_,
  get: Getter<T>,
  api: ResolveStoreApi<S>,
  path: ReadonlyArray<string>
) => T;

export function lens<T, S = unknown, Setter_ extends Setter<T> = Setter<T>>(
  fn: Lens<T, S, Setter_>
): LensOpaqueType<T, S> {
  const self = (set, get, api, path) => {
    const [_set, _get]: any = createLens(set, get, path);
    return fn(_set, _get, api, path);
  };
  self[LENS_TAG] = true;
  return self as any;
}

const findLensAndCreate = (x, set, get, api, path = [] as string[]) => {
  let res = x;

  if (isPlainObject(x)) {
    res = {};

    const keys = Array<string | symbol>().concat(
      Object.getOwnPropertyNames(x),
      Object.getOwnPropertySymbols?.(x) ?? [] // ie 11
    );

    keys.forEach((k) => {
      let v = x[k];

      // Symbol props are only for storing metadata
      if (typeof k === "symbol") {
        res[k] = v;
        return;
      }

      if (isLens(v)) {
        v = v(set, get, api, path.concat(k));
      }

      res[k] = findLensAndCreate(v, set, get, path.concat(k));
    });
  }

  return res;
};

type CheckLenses<T, SA extends StoreApi<unknown>> = {
  [P in keyof T]: T[P] extends LensTypeInfo<infer L, infer LSA>
    ? SA extends LSA
      ? LensOpaqueType<L, LSA>
      : LensOpaqueType<L, SA>
    : T[P] extends object
    ? CheckLenses<T[P], SA>
    : T[P];
};

type WithLensesImpl = <T>(
  f: StateCreator<T, [], []> | T
) => StateCreator<T, [], []>;

const withLensesImpl: WithLensesImpl = (config) => (set, get, api) => {
  // @ts-ignore
  const obj = typeof config === "function" ? config(set, get, api) : config;
  return findLensAndCreate(obj, set, get, api);
};

type WithLenses = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f:
    | CheckLenses<T, Mutate<StoreApi<T>, Mps>>
    | StateCreator<T, Mps, Mcs, CheckLenses<T, Mutate<StoreApi<T>, Mps>>>
) => StateCreator<T, Mps, Mcs>;

export const withLenses = withLensesImpl as unknown as WithLenses;

// helpers

export type CustomSetter<F, T, S> = [
  set: F,
  get: Getter<T>,
  api: ResolveStoreApi<S>,
  path: ReadonlyArray<string>
];

export const customSetter = (setter) => (fn) => (set, get, api, path) =>
  fn(setter(set), get, api, path);

export type NamedSet<T> = (
  partial: Partial<T> | ((state: T) => Partial<T> | void),
  name?: string,
  replace?: boolean
) => void;

export const namedSetter = customSetter(
  (set) => (partial, name, replace) => set(partial, replace, name)
) as <T, S = any>(
  fn: (...args: CustomSetter<NamedSet<T>, T, S>) => T
) => Lens<T, S>;
