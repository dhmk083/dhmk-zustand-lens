import { mergeDeep } from "@dhmk/utils";
import { Getter, ResolveStoreApi, Context, Lens } from "./core";

export { mergeDeep } from "@dhmk/utils";

export const mergeDeepLeft = <T>(a: unknown, b: T): T => mergeDeep(b, a as any);

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

export function subscribe<S, T>(
  store: { subscribe: (fn: (s: S) => any) => any; getState(): S },
  selector: (state: S) => T,
  effect: (state: T, prevState: T) => void,
  options: {
    equalityFn?: (a: T, b: T) => boolean;
    fireImmediately?: boolean;
  } = {}
) {
  const { equalityFn = Object.is, fireImmediately = false } = options;

  let curr = selector(store.getState());

  if (fireImmediately) effect(curr, curr);

  return store.subscribe((state) => {
    const next = selector(state);
    if (!equalityFn(next, curr)) {
      const prev = curr;
      effect((curr = next), prev);
    }
  });
}
