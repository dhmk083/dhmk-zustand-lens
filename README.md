# @dhmk/zustand-lens

Lens support for zustand.

With this package you can easily create sub-stores inside main store.

A lens is a pair of functions `set` and `get` which have same signatures as zustand's functions, but they operate only on a particular slice of main state.

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

```
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
