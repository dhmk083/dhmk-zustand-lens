import create from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import { isDraft } from "immer";
import { createLens, lens, withLenses, namedSetter } from "./";

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

  it("passes rest arguments to parent setter", () => {
    let store = {
      subA: {
        id: 123,
        value: "abc",
      },
    };

    const set = jest.fn((partial, replace, arg1, arg2, arg3) => {
      store = Object.assign({}, store, partial(store));
    });
    const get = () => store;

    const [aSet] = createLens(set, get, "subA");

    aSet({ value: "def" }, true, "arg1", "arg2", "arg3");
    expect(set).toBeCalledWith(
      expect.any(Function),
      false,
      "arg1",
      "arg2",
      "arg3"
    );

    set.mockClear();

    aSet(() => ({ value: "def" }), true, "arg3", "arg4", "arg5");
    expect(set).toBeCalledWith(
      expect.any(Function),
      false,
      "arg3",
      "arg4",
      "arg5"
    );
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

describe("lens", () => {
  it("calls creator function with (set, get, api, path)", () => {
    interface Store {
      sub: {
        name: string;
      };
    }

    const store = create<Store>(
      withLenses((storeSet, storeGet, storeApi) => ({
        sub: lens((set, get, api, path) => {
          expect(set).toEqual(expect.any(Function));
          expect(get).toEqual(expect.any(Function));
          expect(api).toBe(storeApi);
          expect(path).toEqual(["sub"]);

          api.getState();

          return { name: "" };
        }),
      }))
    );

    expect.assertions(4);
  });

  it("doesn`t throw an error if created outside `withLenses` function", () => {
    const todosSlice = lens(() => ({
      todos: [1],
    }));

    const usersSlice = lens(() => ({
      users: [2],
    }));

    const useStore = create(
      withLenses(() => ({
        todosSlice,
        usersSlice,
      }))
    );

    expect(useStore.getState().todosSlice.todos).toEqual([1]);
    expect(useStore.getState().usersSlice.users).toEqual([2]);
  });
});

describe("withLenses", () => {
  it("also accepts an object config", () => {
    interface Test {
      test: {
        name: string;
        setName;
      };
    }

    const store = create<Test>(
      withLenses({
        test: lens((set) => ({
          name: "abc",

          setName() {
            set({ name: "def" });
          },
        })),
      })
    );

    expect(store.getState()).toEqual({
      test: { name: "abc", setName: expect.any(Function) },
    });
    store.getState().test.setName();
    expect(store.getState().test.name).toEqual("def");
  });

  it("preserves Symbols", () => {
    const symbol = Symbol();

    const store = create(
      withLenses({
        test: lens(() => ({
          [symbol]: true,
        })),

        [symbol]: true,
      })
    );

    expect(store.getState()[symbol]).toEqual(true);
    expect(store.getState().test[symbol]).toEqual(true);
  });
});

it("namedSetter", () => {
  interface Test {
    name: string;
    setName();
  }

  const spy = jest.fn();
  const _ = null as any;

  const state = namedSetter<Test>((set) => ({
    name: "abc",

    setName() {
      set({ name: "def" }, "setName");
    },
  }))(spy, _, _, _);

  state.setName();
  expect(spy).toBeCalledWith({ name: "def" }, undefined, "setName");
});
