# @dhmk/zustand-lens

Lens support for zustand.

With this package you can easily create sub-stores inside main store.

A lens is a pair of functions `set` and `get` which have same signatures as zustand's functions, but they operate only on a particular slice of main state.

A quick comparison:

```ts
import create from "zustand";
import { lens } from "@dhmk/zutand-lens";

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

```
npm install @dhmk/zustand-lens
```

## Usage

```ts
import { create } from 'zustand'
import { withLenses, lens } from '@dhmk/zutand-lens'

// set, get - global
const useStore = create(withLenses((set, get, api) => {
  return {
    // set, get - only for storeA
    storeA: lens((set, get) => ({
      data: ...,

      action: (arg) => set({data: arg})
    })),

    // set, get - only for storeB
    storeB: lens((set, get) => ({
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

Middleware function.

It calls `config` function with the same args as the default zustand's `create` function and then converts returned object expanding all `lens` instances to proper objects.

### `lens(fn: (set, get) => T): T`

Creates a lens object.

It calls provided function with two arguments: set and get. These two functions write and read a subset of global state relative to a place where `lens` is appeared.

**WARNING**: you should not use return value of this function in your code. It returns opaque object that is transformed into a real object by `withLenses` function.

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
  withLenses(() => ({
    id: 123,
    name: "test",

    nested: lens((set) => ({
      text: "test",
      isOk: true,

      toggle() {
        set((p /* Nested */) => ({ isOk: !p.isOk }));
      },
    })),
  }))
);

// option 2: type lens
const store2 = create(
  withLenses(() => ({
    id: 123,
    name: "test",

    nested: lens<Nested>((set) => ({
      text: "test",
      isOk: true,

      toggle() {
        set((p /* Nested */) => ({ isOk: !p.isOk }));
      },
    })),
  }))
);
```

## Immer

Immer is supported out-of-the-box. You just need to type the whole store. There is one caveat, however. Draft's type will be `T` and not `Draft<T>`. You can either add it yourself, or just don't use readonly properties in your type.

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
    withLenses(() => ({
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
    }))
  )
);
```
