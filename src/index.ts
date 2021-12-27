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

type SetState2<T> = T extends object ? SetState<T> : never;
type GetState2<T> = T extends object ? GetState<T> : never;

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
export function createLens(set, get, path) {
  const normPath = typeof path === "string" ? [path] : path;

  const _set = (partial, replace) =>
    set((parentValue) => {
      const ourOldValue: any = getIn(parentValue, normPath);
      const ourTmpValue =
        typeof partial === "function" ? partial(ourOldValue) : partial;
      const ourNextValue = replace
        ? ourTmpValue
        : { ...ourOldValue, ...ourTmpValue };

      const isObject = ourNextValue && typeof ourNextValue === "object";

      return isObject && shallowEqual(ourOldValue as any, ourNextValue)
        ? parentValue
        : setIn(parentValue, normPath, ourNextValue);
    });

  const _get = () => getIn(get(), normPath);

  return [_set, _get] as any;
}

const LENS_TAG = "@dhmk/LENS_TAG";

const isLens = (x) => !!x && x[LENS_TAG];

let canCreateLens = false;

export function lens<T extends State>(
  fn: (set: SetState<T>, get: GetState<T>) => T
): T {
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

type WithLenses = {
  <TState extends State>(
    createState:
      | StateCreator<
          TState,
          SetState<TState>,
          GetState<TState>,
          StoreApi<TState>
        >
      | StoreApi<TState>
  ): typeof createState;

  <
    TState extends State,
    CustomSetState,
    CustomGetState,
    CustomStoreApi extends StoreApi<TState>
  >(
    createState: StateCreator<
      TState,
      CustomSetState,
      CustomGetState,
      CustomStoreApi
    >
  ): typeof createState;
};

export const withLenses: WithLenses = (config) => (set, get, api) => {
  try {
    canCreateLens = true;
    return findLensAndCreate(config(set, get, api), set, get);
  } finally {
    canCreateLens = false;
  }
};
