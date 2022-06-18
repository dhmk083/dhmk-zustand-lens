import type {
  State,
  GetState,
  SetState,
  StateCreator,
  StoreMutatorIdentifier,
  StoreApi,
} from "zustand/vanilla";

import {
  getIn,
  setIn,
  shallowEqual,
  isPlainObject,
  PropType,
} from "@dhmk/utils";

type SetState2<T> = (
  partial: Partial<T> | ((state: T) => Partial<T> | void),
  replace?: boolean | undefined,
  ...args
) => void;

type GetState2<T> = () => T;

export function createLens<T extends State, P extends string[]>(
  set: SetState<T>,
  get: GetState<T>,
  path: [...P]
): [SetState2<PropType<T, P>>, GetState2<PropType<T, P>>];
export function createLens<T extends State, P extends string>(
  set: SetState<T>,
  get: GetState<T>,
  path: P
): [SetState2<PropType<T, [P]>>, GetState2<PropType<T, [P]>>];
export function createLens<T extends State, P extends string[]>(
  set: SetState2<T>,
  get: GetState2<T>,
  path: [...P]
): [SetState2<PropType<T, P>>, GetState2<PropType<T, P>>];
export function createLens<T extends State, P extends string>(
  set: SetState2<T>,
  get: GetState2<T>,
  path: P
): [SetState2<PropType<T, [P]>>, GetState2<PropType<T, [P]>>];
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
  : X extends State
  ? StoreApi<X>
  : unknown;

export type Setter<T extends State> = SetState2<T>;

export type Getter<T extends State> = GetState<T>;

export type Lens<
  T extends State,
  S extends State | StoreApi<State> = State,
  Setter extends SetState2<T> = SetState2<T>
> = (
  set: Setter,
  get: GetState<T>,
  api: ResolveStoreApi<S>,
  path: ReadonlyArray<string>
) => T;

export function lens<
  T extends State,
  S extends State | StoreApi<State> = State,
  Setter extends SetState2<T> = SetState2<T>
>(fn: Lens<T, S, Setter>): T {
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

type PopArgument<T extends (...a: never[]) => unknown> = T extends (
  ...a: [...infer A, infer _]
) => infer R
  ? (...a: A) => R
  : never;

type WithLensesImpl = <T extends State>(
  f: PopArgument<StateCreator<T, [], []>> | T
) => PopArgument<StateCreator<T, [], []>>;

const withLensesImpl: WithLensesImpl = (config) => (set, get, api) => {
  // @ts-ignore
  const obj = typeof config === "function" ? config(set, get, api) : config;
  return findLensAndCreate(obj, set, get, api);
};

type WithLenses = <
  T extends State,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs> | T
) => StateCreator<T, Mps, Mcs>;

export const withLenses = withLensesImpl as unknown as WithLenses;

// helpers

export type CustomSetter<F, T extends State, S extends State> = [
  set: F,
  get: Getter<T>,
  api: ResolveStoreApi<S>,
  path: ReadonlyArray<string>
];

export const customSetter = (setter) => (fn) => (set, get, api, path) =>
  fn(setter(set), get, api, path);

export type NamedSet<T extends State> = (
  partial: Partial<T> | ((state: T) => Partial<T> | void),
  name?: string,
  replace?: boolean
) => void;

export const namedSetter = customSetter(
  (set) => (partial, name, replace) => set(partial, replace, name)
) as <T extends State, S extends State = any>(
  fn: (...args: CustomSetter<NamedSet<T>, T, S>) => T
) => Lens<T, S>;
