# @dhmk/zustand-lens

Lens support for zustand.

With this package you can easily create sub-stores inside main store.

A lens has a pair of functions `set` and `get` which have same signatures as zustand's functions, but they operate only on a particular slice of main state.

A quick comparison:

```ts
import create from "zustand";
import { lens } from "@dhmk/zustand-lens";

create((set, get) => {
  // write and read whole state

  return {
    subStore: lens((subSet, subGet) => {
      // write and read `subStore` state
    }),
  };
});
```

## Install

```sh
# for zustand v3
npm install @dhmk/zustand-lens@zustand3

# for zustand v4
npm install @dhmk/zustand-lens
```

## Usage

```ts
import { create } from 'zustand'
import { withLenses, lens } from '@dhmk/zustand-lens'

// set, get - global
const useStore = create(withLenses((set, get, api) => {
  return {
    // set, get - only for storeA
    storeA: lens((set, get, api) => ({
      data: ...,

      action: (arg) => set({data: arg})
    })),

    // set, get - only for storeB
    storeB: lens((set, get, api) => ({
      data: ...,

      action: (arg) => set({data: arg})
    })),

    globalStore: {
      data: ...,

      action: () => set({...}) // global setter
    }
  }
}))

```

## API

### `withLenses(config: (set, get, api) => T): T`

### `withLenses(obj: T): T`

Middleware function.

It calls `config` function with the same args as the default zustand's `create` function and then converts returned object expanding all `lens` instances to proper objects.

You can also provide a plain object instead of a function.

### `lens(fn: (set, get, api, path) => T): T`

Creates a lens object.

The first two parameters `set` and `get` are functions which write and read a subset of global state relative to a place where `lens` is appeared. The third, `api` parameter is zustand store and the last parameter `path` is an array of strings which represent lens position inside global state.

Setter has this signature: `(value: Partial<T> | ((prev: T) => Partial<T>), replace?: boolean, ...args) => void`. It passes unknown arguments to a top-level `set` function.

**WARNING**: you should not use return value of this function in your code. It returns opaque object that is transformed into a real object by `withLenses` function.

**NOTE**: this function used to throw an error if it was called outside `withLenses` function. It was meant for accenting, that `lens` can not be created dynamically after `withLenses` has been called. But it's fine to create lens beforehand, so I removed that error (1.0.3 and 2.0.3). Now you can call it like this:

```js
const todosSlice = lens(() => ...)
const usersSlice = lens(() => ...)

const useStore = create(withLenses({
  todosSlice,
  usersSlice,
}))
```

Also, you can use type helper if you want to separate your function from `lens` wrapper:

```ts
import { Lens, lens } from "@dhmk/zustand-lens";

/*
type Lens<
  T,      // slice type
  S,      // store state type or store api type
  Setter  // `set` function type
>
*/

type MenuState = {
  isOpened: boolean;

  toggle(open);
};

// `set` and `get` are typed
const menuState: Lens<MenuState> = (set, get, api) => ({
  isOpened: false,

  toggle(open) {
    set({ isOpened: open });
  },
});

const menuSlice = lens(menuState);
```

### `createLens(set, get, path: string | string[]): [set, get]`

Creates explicit lens object.

It takes `set` and `get` arguments and `path` and returns a pair of setter and getter which operates on a subset of parent state relative to `path`. You can chain lenses. Also, you can use this function as standalone, without `withLenses` middleware.

```ts
import { create } from "zustand";
import { createLens } from "@dhmk/zustand-lens";

const useStore = create((set, get) => {
  const lensA = createLens(set, get, "a");
  const lensB = createLens(...lensA, "b");
  const [setC] = createLens(...lensB, "c");

  return {
    a: {
      b: {
        c: {
          value: 111,
        },
      },
    },

    changeValue: (value) => setC({ value }),
  };
});

useStore.getState().changeValue(222);

console.log(useStore.getState());
/*
a: {
  b: {
    c: {
      value: 222
    }
  }
}
*/
```

## Typescript

```ts
type Store = {
  id: number;
  name: string;

  nested: Nested;
};

type Nested = {
  text: string;
  isOk: boolean;

  toggle();
};

// option 1: type whole store
const store1 = create<Store>(
  withLenses({
    id: 123,
    name: "test",

    nested: lens((set) => ({
      text: "test",
      isOk: true,

      toggle() {
        set((p /* Nested */) => ({ isOk: !p.isOk }));
      },
    })),
  })
);

// option 2: type lens
const store2 = create(
  withLenses({
    id: 123,
    name: "test",

    nested: lens<Nested>((set) => ({
      text: "test",
      isOk: true,

      toggle() {
        set((p /* Nested */) => ({ isOk: !p.isOk }));
      },
    })),
  })
);
```

## Immer

Immer is supported out-of-the-box. You just need to type the whole store. There is one caveat, however. Draft's type will be `T` and not `Draft<T>`. You can either add it yourself, or just don't use readonly properties in your type.

Below is an example of using immer middleware with zustand 3. For zustand 4 you should use built-in middleware: `import { immer } from "zustand/middleware/immer"`.

```ts
import produce, { Draft } from "immer";

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

const store = create<Store>(
  immer(
    withLenses({
      id: 123,
      name: "test",

      nested: lens((set) => ({
        text: "test",
        isOk: true,

        toggle() {
          set((p /* Nested */) => {
            p.isOk = !p.isOk;
          });
        },
      })),
    })
  )
);
```
