import { Getter, ResolveStoreApi, Context, Lens } from "./core";

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
