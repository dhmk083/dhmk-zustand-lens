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

export const postprocess = Symbol("postprocess");

export type Setter<T> = (
  partial: Partial<T> | ((state: T) => Partial<T> | void),
  replace?: boolean | undefined,
  ...args
) => void;

export type Getter<T> = () => T;

type CreateLensSetter<T> = (
  partial: (s: T) => Partial<T>,
  replace?: boolean,
  ...args
) => any;

export function createLens<T, P extends string[]>(
  set: CreateLensSetter<T>,
  get: Getter<T>,
  path: readonly [...P]
): [Setter<PropType<T, P>>, Getter<PropType<T, P>>];
export function createLens<T, P extends string>(
  set: CreateLensSetter<T>,
  get: Getter<T>,
  path: P
): [Setter<PropType<T, [P]>>, Getter<PropType<T, [P]>>];
// pathless overload to normalize setter's behavior
// function createLens(set, get)
export function createLens(set, get, path) {
  const normPath =
    path === undefined ? undefined : typeof path === "string" ? [path] : path;

  const _set = (partial, replace, ...args) =>
    set(
      (parentValue) => {
        const ourOldValue: any = normPath
          ? getIn(parentValue, normPath)
          : parentValue;
        const ourTmpValue =
          typeof partial === "function" ? partial(ourOldValue) : partial;
        const isPlain = isPlainObject(ourOldValue);

        // immer detection
        const ourOldValue2 = normPath ? getIn(get(), normPath) : get();
        const isDraft = isPlain && ourOldValue !== ourOldValue2;

        if (isDraft) {
          const draft = ourOldValue;
          if (ourTmpValue) Object.assign(draft, ourTmpValue);
          const pp = draft[postprocess]?.(draft, ourOldValue2, ...args);
          if (pp) Object.assign(draft, pp);
          return;
        }

        const ourTmpValue2 =
          replace || !isPlain
            ? ourTmpValue
            : { ...ourOldValue, ...ourTmpValue };

        const ourNextValue = isPlain
          ? {
              ...ourTmpValue2,
              ...ourTmpValue2[postprocess]?.(
                ourTmpValue2,
                ourOldValue,
                ...args
              ),
            }
          : ourTmpValue2;

        const isSame = isPlain
          ? shallowEqual(ourOldValue as any, ourNextValue)
          : Object.is(ourOldValue, ourNextValue);

        return isSame
          ? parentValue
          : normPath
          ? setIn(parentValue, normPath, ourNextValue)
          : ourNextValue;
      },
      normPath ? false : replace,
      ...args
    );

  const _get = () => (normPath ? getIn(get(), normPath) : get());

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

type LensMeta<T> = {
  [postprocess]?: (
    state: T,
    prevState: T,
    ...args: unknown[]
  ) => Partial<T> | void;
};

export type Lens<T, S = unknown, Setter_ extends Setter<T> = Setter<T>> = (
  set: Setter_,
  get: Getter<T>,
  api: ResolveStoreApi<S>,
  path: ReadonlyArray<string>
) => T & LensMeta<T>;

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

      res[k] = findLensAndCreate(v, set, get, api, path.concat(k));
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
  const [_set] = createLens(set, get, undefined as any); // use pathless overload

  // @ts-ignore
  const obj = typeof config === "function" ? config(_set, get, api) : config;
  return findLensAndCreate(obj, _set, get, api);
};

type WithLenses = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f:
    | (CheckLenses<T, Mutate<StoreApi<T>, Mps>> & LensMeta<T>)
    | StateCreator<
        T & LensMeta<T>,
        Mps,
        Mcs,
        CheckLenses<T, Mutate<StoreApi<T>, Mps>>
      >
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
