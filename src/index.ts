import type {
  State,
  GetState,
  SetState,
  StateCreator,
  StoreApi,
  PartialState,
} from "zustand/vanilla";

import {
  getIn,
  setIn,
  shallowEqual,
  isPlainObject,
  PropType,
} from "@dhmk/utils";

import type { Draft } from "immer";

type ImmerSet<T> = (
  partial: ((draft: Draft<T>) => void) | Partial<T>,
  replace?: boolean
) => void;

type SetState2<T> = T extends State
  ? <
      K1 extends keyof T,
      K2 extends keyof T = K1,
      K3 extends keyof T = K2,
      K4 extends keyof T = K3
    >(
      partial: PartialState<T, K1, K2, K3, K4>,
      replace?: boolean,
      ...args
    ) => void
  : T extends boolean
  ? (
      arg: boolean | ((prev: boolean) => boolean),
      replace?: boolean,
      ...args
    ) => void
  : (arg: T | ((prev: T) => T), replace?: boolean, ...args) => void;

// Lens<T> constraint
type SetStateConstraint<T extends State> = <
  K1 extends keyof T,
  K2 extends keyof T = K1,
  K3 extends keyof T = K2,
  K4 extends keyof T = K3
>(
  partial: PartialState<T, K1, K2, K3, K4>,
  ...args
) => void;

type GetState2<T> = () => T;

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
export function createLens<T extends State, P extends string[]>(
  set: ImmerSet<T>,
  get: GetState2<T>,
  path: [...P]
): [ImmerSet<PropType<T, P>>, GetState2<PropType<T, P>>];
export function createLens<T extends State, P extends string>(
  set: ImmerSet<T>,
  get: GetState2<T>,
  path: P
): [ImmerSet<PropType<T, [P]>>, GetState2<PropType<T, [P]>>];
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

type ResolveStoreApi<X> = IsAny<X> extends true
  ? StoreApi<any>
  : X extends StoreApi<any>
  ? X
  : X extends State
  ? StoreApi<X>
  : unknown;

export type Lens<
  T extends State,
  S extends State | StoreApi<State> = State,
  Setter extends SetStateConstraint<T> = SetState2<T>
> = (set: Setter, get: GetState<T>, api: ResolveStoreApi<S>) => T;

export function lens<
  T extends State,
  S extends State | StoreApi<State> = State,
  Setter extends SetStateConstraint<T> = SetState2<T>
>(fn: Lens<T, S, Setter>): T {
  const self = (set, get, api, path) => {
    const [_set, _get]: any = createLens(set, get, path);
    return fn(_set, _get, api);
  };
  self[LENS_TAG] = true;
  return self as any;
}

const findLensAndCreate = (x, set, get, api, path = [] as string[]) => {
  let res = x;

  if (isPlainObject(x)) {
    res = {};

    for (const k in x) {
      let v = x[k];

      if (isLens(v)) {
        v = v(set, get, api, path.concat(k));
      }

      res[k] = findLensAndCreate(v, set, get, path.concat(k));
    }
  }

  return res;
};

// using this would require to explicitly type all `lens` in addition to typing the whole store
type ResolveLenses<T> = T extends
  | ReadonlyArray<any>
  | ReadonlySet<any>
  | ReadonlyMap<any, any>
  | Date
  ? T
  : T extends Record<any, any>
  ? {
      [P in keyof T]: T[P] extends LensCreator<infer L>
        ? ResolveLenses<L>
        : T[P];
    }
  : T;

export const withLenses =
  <
    T extends State,
    CustomSetState = SetState<T>,
    CustomGetState extends GetState<T> = GetState<T>,
    CustomStoreApi extends StoreApi<T> = StoreApi<T>
  >(
    config: StateCreator<T, CustomSetState, CustomGetState, CustomStoreApi>
  ): StateCreator<T, CustomSetState, CustomGetState, CustomStoreApi> =>
  (set, get, api) =>
    findLensAndCreate(config(set, get, api), set, get, api);
