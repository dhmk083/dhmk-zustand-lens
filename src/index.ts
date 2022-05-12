import type {
  State,
  GetState,
  SetState,
  StateCreator,
  StoreApi,
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
  ? SetState<T>
  : T extends boolean
  ? (arg: boolean | ((prev: boolean) => boolean), replace?: boolean) => void
  : (arg: T | ((prev: T) => T), replace?: boolean) => void;

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

  const _set = (partial, replace) =>
    set((parentValue) => {
      const ourOldValue: any = getIn(parentValue, normPath);
      const ourTmpValue =
        typeof partial === "function" ? partial(ourOldValue) : partial;
      const isPlain = isPlainObject(ourOldValue);
      const ourNextValue =
        replace || !isPlain ? ourTmpValue : { ...ourOldValue, ...ourTmpValue };

      const isSame = isPlain
        ? shallowEqual(ourOldValue as any, ourNextValue)
        : ourOldValue === ourNextValue; // todo Object.is

      return isSame ? parentValue : setIn(parentValue, normPath, ourNextValue);
    });

  const _get = () => getIn(get(), normPath);

  return [_set, _get] as any;
}

const LENS_TAG = "@dhmk/LENS_TAG";

const isLens = (x) => !!x && x[LENS_TAG];

let canCreateLens = false;

export type Lens<T extends State> = (set: SetState<T>, get: GetState<T>) => T;

export function lens<T extends State>(fn: Lens<T>): T {
  if (!canCreateLens)
    throw new Error(
      "`lens` function has been called outside `withLenses` function."
    );

  const self = (set, get, path) => {
    const [_set, _get]: any = createLens(set, get, path);
    return fn(_set, _get);
  };
  self[LENS_TAG] = true;
  return self as any;
}

const findLensAndCreate = (x, set, get, path = [] as string[]) => {
  let res = x;

  if (isPlainObject(x)) {
    res = {};

    for (const k in x) {
      let v = x[k];

      if (isLens(v)) {
        v = v(set, get, path.concat(k));
      }

      res[k] = findLensAndCreate(v, set, get, path.concat(k));
    }
  }

  return res;
};

export const withLenses =
  <
    T extends State,
    CustomSetState = SetState<T>,
    CustomGetState extends GetState<T> = GetState<T>,
    CustomStoreApi extends StoreApi<T> = StoreApi<T>
  >(
    config: StateCreator<T, CustomSetState, CustomGetState, CustomStoreApi>
  ): StateCreator<T, CustomSetState, CustomGetState, CustomStoreApi> =>
  (set, get, api) => {
    try {
      canCreateLens = true;
      return findLensAndCreate(config(set, get, api), set, get);
    } finally {
      canCreateLens = false;
    }
  };
