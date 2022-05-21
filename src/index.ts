import type {
  State,
  GetState,
  SetState,
  StateCreator,
  StoreMutatorIdentifier,
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

const isLens = (x) => !!x && x[LENS_TAG];

let canCreateLens = false;

export type Setter<T extends State> = SetState2<T>;

export type Getter<T extends State> = GetState<T>;

export type Lens<
  T extends State,
  Setter extends SetState2<T> = SetState2<T>
> = (set: Setter, get: GetState<T>) => T;

export function lens<
  T extends State,
  Setter extends SetState2<T> = SetState2<T>
>(fn: Lens<T, Setter>): T {
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

type PopArgument<T extends (...a: never[]) => unknown> = T extends (
  ...a: [...infer A, infer _]
) => infer R
  ? (...a: A) => R
  : never;

type WithLensesImpl = <T extends State>(
  f: PopArgument<StateCreator<T, [], []>>
) => PopArgument<StateCreator<T, [], []>>;

const withLensesImpl: WithLensesImpl = (config) => (set, get, api) => {
  try {
    canCreateLens = true;
    return findLensAndCreate(config(set, get, api), set, get);
  } finally {
    canCreateLens = false;
  }
};

type WithLenses = <
  T extends State,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs>
) => StateCreator<T, Mps, Mcs>;

export const withLenses = withLensesImpl as unknown as WithLenses;
