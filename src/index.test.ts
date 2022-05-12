import create from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import { isDraft } from "immer";
import { createLens, lens, withLenses } from "./";

describe("createLens", () => {
  it("returns a scoped set/get pair", () => {
    type State = {
      deeply: {
        nested: {
          id: number;
          prop: string;
        };
      };

      getter;
      partial;
      partialFn;
      replace;
      replaceFn;
    };

    const store = create<State>((set, get) => {
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
    const store = create<Store>()(
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
