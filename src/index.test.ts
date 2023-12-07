import { createStore as create } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import { isDraft, produce } from "immer";
import {
  createLens,
  lens,
  withLenses,
  namedSetter,
  postprocess,
  setter,
} from "./";

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

  it("applies `postprocess` function", () => {
    let store = {
      subA: {
        id: 123,
        value: "abc",
        [postprocess]: (state, prevState, ...args) => {
          expect(args).toEqual(["arg1", "arg2", "arg3"]);

          return {
            value: prevState.value + state.value,
          };
        },
      },
    };

    const set = (partial) => {
      store = Object.assign({}, store, partial(store));
    };
    const get = () => store;

    const [aSet, aGet] = createLens(set, get, "subA");
    aSet({ value: "def" }, false, "arg1", "arg2", "arg3");
    expect(aGet()).toMatchObject({ id: 123, value: "abcdef" });

    const immerSet = (partial) => set((state) => produce(state, partial));

    const [iSet, iGet] = createLens(immerSet, get, "subA");
    iSet({ value: "ghi" }, false, "arg1", "arg2", "arg3");
    expect(iGet()).toMatchObject({ id: 123, value: "abcdefghi" });
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
  it("calls creator function with (set, get, api, context)", () => {
    interface Store {
      sub: {
        name: string;
        test();

        nested: {
          even: {
            deeper: {
              name: string;
              test();
            };
          };
        };
      };
    }

    const store = create<Store>(
      withLenses((storeSet, storeGet, storeApi) => ({
        sub: lens((set, get, api, ctx) => {
          expect(set).toEqual(expect.any(Function));
          expect(get).toEqual(expect.any(Function));
          expect(api).toBe(storeApi);
          expect(ctx.rootPath).toEqual(["sub"]);
          expect(ctx.relativePath).toEqual(["sub"]);
          expect(ctx.set).toBe(set);
          expect(ctx.get).toBe(get);
          expect(ctx.api).toBe(api);

          return {
            name: "",
            test() {
              set({ name: "ok-1" });
            },

            nested: {
              even: {
                deeper: lens((set, get, api, ctx) => {
                  expect(set).toEqual(expect.any(Function));
                  expect(get).toEqual(expect.any(Function));
                  expect(api).toBe(storeApi);
                  expect(ctx.rootPath).toEqual([
                    "sub",
                    "nested",
                    "even",
                    "deeper",
                  ]);
                  expect(ctx.relativePath).toEqual([
                    "nested",
                    "even",
                    "deeper",
                  ]);
                  expect(ctx.set).toBe(set);
                  expect(ctx.get).toBe(get);
                  expect(ctx.api).toBe(api);

                  return {
                    name: "",
                    test() {
                      set({ name: "ok-2" });
                    },
                  };
                }),
              },
            },
          };
        }),
      }))
    );

    store.getState().sub.test();
    expect(store.getState().sub.name).toBe("ok-1");

    store.getState().sub.nested.even.deeper.test();
    expect(store.getState().sub.nested.even.deeper.name).toBe("ok-2");
  });

  it("doesn`t throw an error if created outside `withLenses` function", () => {
    const todosSlice = lens(() => ({
      todos: [1],
    }));

    const usersSlice = lens(() => ({
      users: [2],
    }));

    const slices = {
      todosSlice,
      usersSlice,
    };

    const useStore = create<typeof slices>(withLenses(slices));

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

    const initializer = {
      test: lens(() => ({
        [symbol]: true,
      })),

      [symbol]: true,
    };

    const store = create<typeof initializer>()(withLenses(initializer));

    expect(store.getState()[symbol]).toEqual(true);
    expect(store.getState().test[symbol]).toEqual(true);
  });

  it("checks lenses api types", () => {
    const one = lens<{ id: number }>(() => ({
      id: 1,
    }));

    type TwoStoreState = { one: { name: string } };

    const two = lens<{ id: number }, TwoStoreState>(() => ({
      id: 1,
    }));

    interface State {
      one: { id: number };
      two: { id: number };
    }

    const store = create<State>()(
      withLenses({
        one,
        // @ts-expect-error
        two,
      })
    );

    const store2 = create<State>()(
      // @ts-expect-error
      withLenses(() => ({
        one,
        two,
      }))
    );

    const store3 = create(
      withLenses({
        one,
        // @ts-expect-error
        two,
      })
    );

    const store4 = create(
      // @ts-expect-error
      withLenses(() => ({
        one,
        two,
      }))
    );
  });

  it("applies `postprocess` function", () => {
    type Test = {
      value: number;
      test();
    };

    const sub = lens<Test>((set) => ({
      value: 1,
      test() {
        set({ value: 2 });
      },
    }));

    const store = create(
      withLenses({
        sub,
        [postprocess]: (state, prevState) => {
          expect(state.sub.value).toBe(2);
          expect(prevState.sub.value).toBe(1);
        },
      })
    );

    store.getState().sub.test();
    expect.assertions(2);
  });

  it("uses `setter` function", () => {
    const cb = jest.fn();

    const store = create(
      withLenses({
        nested: lens<any>(() => ({
          deep: {
            slice: lens<any>((set) => ({
              id: 123,
              test() {
                set({ id: 456 });
              },
              [setter]: (set, ctx) => {
                cb(1);
                set();
              },
            })),
          },
        })),
        [setter]: (set, ctx) => {
          cb(2);
          set();
        },
      })
    );

    store.getState().nested.deep.slice.test();

    expect(cb).toBeCalledTimes(2);
    expect(cb).nthCalledWith(1, 1);
    expect(cb).nthCalledWith(2, 2);
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
