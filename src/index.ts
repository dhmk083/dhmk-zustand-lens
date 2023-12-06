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

const isLens = (x): x is Lens<any> => !!x && x[LENS_TAG];

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

type Context<T, S> = {
  set: Setter<T>;
  get: Getter<T>;
  api: ResolveStoreApi<S>;
  rootPath: ReadonlyArray<string>;
  relativePath: ReadonlyArray<string>;
};

export type Lens<T, S = unknown, Setter_ = Setter<T>, Ctx = Context<T, S>> = (
  set: Setter_,
  get: Getter<T>,
  api: ResolveStoreApi<S>,
  ctx: Ctx
) => T & LensMeta<T>;

export function lens<T, S = unknown, Setter_ extends Setter<T> = Setter<T>>(
  fn: Lens<T, S, Setter_>
): LensOpaqueType<T, S> {
  const self = (set, get, api, ctx /* partial context */) => {
    const [_set, _get]: any = createLens(set, get, ctx.relativePath);
    ctx.set = _set;
    ctx.get = _get;
    return fn(_set, _get, api, ctx);
  };
  self[LENS_TAG] = true;
  return self as any;
}

const findLensAndCreate = (x, parentCtx: Context<any, any>) => {
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

      let nextSet = parentCtx.set;
      let nextGet = parentCtx.get;
      let nextRelativePath = parentCtx.relativePath.concat(k);

      if (isLens(v)) {
        // partial context
        // `lens` will update it with `set` and `get`
        const lensCtx = {
          api: parentCtx.api,
          rootPath: parentCtx.rootPath.concat(k),
          relativePath: parentCtx.relativePath.concat(k),
        } as unknown as Context<any, any>;

        v = v(parentCtx.set, parentCtx.get, parentCtx.api, lensCtx);
        nextSet = lensCtx.set;
        nextGet = lensCtx.get;
        nextRelativePath = [];
      }

      res[k] = findLensAndCreate(v, {
        set: nextSet,
        get: nextGet,
        api: parentCtx.api,
        rootPath: parentCtx.rootPath.concat(k),
        relativePath: nextRelativePath,
      });
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
  return findLensAndCreate(obj, {
    set: _set,
    get,
    api,
    rootPath: [],
    relativePath: [],
  });
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
  ctx: Context<T, S>
];

export const customSetter = (setter) => (fn) => (set, get, api, ctx) =>
  fn(setter(set), get, api, ctx);

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
