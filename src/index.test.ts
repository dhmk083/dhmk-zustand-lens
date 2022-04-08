import create from "zustand/vanilla";
import { State, SetState, GetState, StoreApi, StateCreator } from "zustand";
import produce, { isDraft, Draft } from "immer";
import { createLens, lens, lens2, withLenses } from "./";

const immer =
  <
    T extends State,
    CustomSetState extends SetState<T> = SetState<T>,
    CustomGetState extends GetState<T> = GetState<T>,
    CustomStoreApi extends StoreApi<T> = StoreApi<T>
  >(
    config: StateCreator<
      T,
      (partial: ((draft: Draft<T>) => void) | T, replace?: boolean) => void,
      CustomGetState,
      CustomStoreApi
    >
  ): StateCreator<T, CustomSetState, CustomGetState, CustomStoreApi> =>
  (set, get, api) =>
    config(
      (partial, replace) => {
        const nextState =
          typeof partial === "function"
            ? produce(partial as (state: Draft<T>) => T)
            : (partial as T);
        return set(nextState, replace);
      },
      get,
      api
    );

describe("createLens", () => {
  it("returns a scoped set/get pair", () => {
    const store = create<any>((set, get) => {
      const [_set, _get] = createLens(set, get, ["deeply", "nested"]);

      return {
        deeply: {
          nested: {
            id: 123,
            prop: "abc",
          },
        },

        getter: _get,

        partial: () => _set({ prop: "def" }),

        partialFn: () => _set((old) => ({ prop: old.prop + "-def" })),

        replace: () => _set({ prop: "qwe" }, true),

        replaceFn: () =>
          _set((old) => ({ id: 456, prop: old.prop + "-qwe" }), true),
      };
    });

    expect(store.getState().getter()).toEqual({ id: 123, prop: "abc" });

    store.getState().partial();
    expect(store.getState().getter()).toEqual({ id: 123, prop: "def" });

    store.getState().partialFn();
    expect(store.getState().getter()).toEqual({ id: 123, prop: "def-def" });

    store.getState().replace();
    expect(store.getState().getter()).toEqual({ prop: "qwe" });

    store.getState().replaceFn();
    expect(store.getState().getter()).toEqual({ id: 456, prop: "qwe-qwe" });
  });

  it("takes `path` as `string | string[]`", () => {
    let store = {
      subA: {
        id: 123,
        value: "abc",
      },

      subB: {
        nested: {
          id: 456,
          value: "abc",
        },
      },
    };

    const set = (x) => (store = Object.assign({}, store, x(store)));
    const get = () => store;

    const [aSet, aGet] = createLens<any, any>(set, get, "subA");

    aSet({ value: "def" });
    expect(aGet()).toEqual({ id: 123, value: "def" });

    const [bSet, bGet] = createLens<any, any>(set, get, ["subB", "nested"]);

    bSet({ value: "def" });
    expect(bGet()).toEqual({ id: 456, value: "def" });
  });
});

type SubStore = {
  id: number;
  name: string;

  changeName(): void;
};

type Store = {
  subA: SubStore;
  subB: SubStore;
};

describe("immer", () => {
  it("works out-of-the-box", () => {
    const store = create<Store>(
      immer(
        withLenses(() => ({
          subA: lens<SubStore>((set) => ({
            id: 123,
            name: "subA",

            changeName: () =>
              set((draft) => {
                expect(isDraft(draft)).toBeTruthy();

                draft.name = "changed";
              }),
          })),

          subB: lens<SubStore>((set) => ({
            id: 234,
            name: "subB",

            changeName: () =>
              set((draft) => {
                expect(isDraft(draft)).toBeTruthy();

                draft.name = "changed";
              }),
          })),
        }))
      )
    );

    expect(store.getState().subA.name).toBe("subA");
    const s1 = store.getState();
    store.getState().subA.changeName();
    expect(store.getState()).not.toBe(s1);
    expect(store.getState().subA.name).toBe("changed");

    expect(store.getState().subB.name).toBe("subB");
    const s2 = store.getState();
    store.getState().subB.changeName();
    expect(store.getState()).not.toBe(s2);
    expect(store.getState().subB.name).toBe("changed");
  });
});

describe("getters support", () => {
  it("works", () => {
    const store = create<any>(
      withLenses(() => ({
        sub: lens2<any>((set, get) => ({
          items: [1, 2],

          get count() {
            return get().items.length;
          },

          add(x) {
            set({ items: get().items.concat(x) });
          },
        })),
      }))
    );

    expect(store.getState().sub.count).toBe(2);

    store.getState().sub.add(3);
    store.getState().sub.add(4);
    expect(store.getState().sub.count).toBe(4);
  });

  it("doesn`t work with immer", () => {
    const store = create<any>(
      immer(
        withLenses(() => ({
          sub: lens2<any>((set, get) => ({
            items: [1, 2],

            get count() {
              return get().items.length;
            },

            add(x) {
              set((draft) => {
                draft.items.push(x);
              });
            },
          })),
        }))
      )
    );

    expect(store.getState().sub.count).toBe(2);

    store.getState().sub.add(3);
    store.getState().sub.add(4);
    // NOTE: 2 is wrong here, actual value is 4.
    // That's because immer evaluates all getters when produces a new state.
    expect(store.getState().sub.count).toBe(2);
  });

  it("doesn`t work with nested lenses", () => {
    const store = create<any>(
      withLenses(() => ({
        sub: lens2<any>((set, get) => ({
          items: [1, 2],

          get count() {
            return get().items.length;
          },

          nested: lens((set) => ({
            id: 123,

            test() {
              set({ id: 456 });
            },
          })),

          add(x) {
            set({ items: get().items.concat(x) });
          },
        })),
      }))
    );

    expect(store.getState().sub.count).toBe(2);

    store.getState().sub.add(3);
    store.getState().sub.add(4);
    expect(store.getState().sub.count).toBe(4);

    store.getState().sub.nested.test();
    store.getState().sub.add(5);
    // NOTE: 4 is wrong here, actual value is 5.
    // That's because both `lens` and `lens2` use `setIn` to produce a new state,
    // and it evaluates all getters on update path.
    // Although, this can be solved, but by sacrificing some performance.
    expect(store.getState().sub.count).toBe(4);
  });
});
