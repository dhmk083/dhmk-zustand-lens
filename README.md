# @dhmk/zustand-lens

Lens support for [zustand](https://github.com/pmndrs/zustand).

With this package you can easily manage nested state inside your main state. Lenses allow you to create isolated and reusable components.

A lens has a pair of functions `set` and `get` which have same signatures as zustand's functions, but they operate only on a particular slice of main state.

A quick comparison:

```ts
import create from "zustand";
import { withLenses, lens } from "@dhmk/zustand-lens";

create(
  withLenses((set, get) => {
    // write and read whole state

    return {
      subStore: lens((subSet, subGet) => {
        // write and read `subStore` state
      }),
    };
  })
);
```

## Install

```sh
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

// or use a shorter version if you don't need global `set` and `get`
create(withLenses({
  storeA: lens(...),
  storeB: lens(...)
}))
```

## API

### `withLenses(config: (set, get, api) => T): T`

### `withLenses(obj: T): T`

Middleware function.

It calls `config` function with the same args as the default zustand's `create` function and then converts returned object expanding all `lens` instances to proper objects.

You can also provide a plain object instead of a function.

### `lens(fn: (set, get, api, context) => T): T`

Creates a lens object.

The first two parameters `set` and `get` are functions which write and read a subset of global state relative to a place where `lens` is appeared. The third, `api` parameter is zustand store and the last parameter `context` is a lens context.

```ts
type LensContext<T, S> = {
  set: Setter<T>; // `set` parameter
  get: Getter<T>; // `get` parameter
  api: ResolveStoreApi<S>; // `api` parameter
  rootPath: ReadonlyArray<string>; // path from root level of state
  relativePath: ReadonlyArray<string>; // path from parent lens or root
  atomic: (fn: () => void) => void; // see `atomic` middleware
};
```

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

Immer is supported out-of-the-box. There is one caveat, however. Draft's type will be `T` and not `Draft<T>`. You can either add it yourself, or just don't use readonly properties in your type.

```ts
import { immer } from "zustand/middleware/immer";

const store = create<Store>()(
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

## Lens middleware

Since `lens` takes an ordinary function, you can pre-process your lens object with various middleware, in the same way zustand does.

This example uses custom `set` function which takes a new state and an action name for logging.

See the source code for tips on how to write and type your middleware.

```ts
import { lens, namedSetter } from "@dhmk/zustand-lens";

const test = lens(
  namedSetter((set) => ({
    name: "abc",

    setName() {
      set({ name: "def" }, "@test/setName");
    },
  }))
);
```

You can even create custom lenses.

```ts
import { lens, namedSetter } from "@dhmk/zustand-lens";

const lensWithNamedSetter = <T, S = unknown>(
  fn: Lens<T, S, NamedSet<T>>
): LensOpaqueType<T, S> => lens(namedSetter(fn));
```

## Advanced options

<a id="atomic"></a>

### `atomic(stateCreator)`

Middleware for atomic set operations. Atomic operations can have multiple calls of `setState` function, but callbacks attached by `subscribe` function will only be called once at the end of an atomic block. This middleware enables `atomic` function from lens context and also makes `[meta].setter` function atomic.

### `[meta]`

Advanced lens configuration. You can place this symbol inside lens or root state. If you are using Typescript and want to add this symbol to a root state, you may encounter an error. In this case use the following workaround:

```ts
// add { [meta] } to your state type
create<State & { [meta] }>()(
  withLenses({
    // ...

    [meta]: {
      // ...
    },
  })
);
```

The `[meta]` object accepts the following optional properties:

#### `postprocess(state: T, prevState: T, ...args): Partial<T> | void`

This function is called after calling `set` function before comitting new state to a parent `set` function. It is called with a new temporary state that will be comitted, current state and all extra arguments, that were passed to a `set` function. You may return new state and it will me merged with a `state` argument. This function must be pure. You may mutate `state` argument only if using `immer` middleware.

#### `setter(next: Function, context: LensContext): void`

This function is called whenever you call lens (or root) `set` function. This way you can customize pre-set and post-set behavior. You can run side-effects here. You should call `next` function once and synchronously to delegate set operation to a parent lens (or root), similar to `next` function in `express.js`. If you are using [`atomic`](#atomic) middleware, this function will be executed atomically. Also you may want to use [`watch`](#watch) helper to conveniently run side-effects on state changes.

### `Understanding order of invocation.`

Given the following store:

```ts
const store = create(
  withLenses({
    someSlice: lens(() => ({
      nested: lens((set) => ({
        id: 1,
        test() {
          console.log("test before");
          set({ id: 2 });
          console.log("test after");
        },
        [meta]: {
          postprocess() {
            console.log("nested postprocess");
          },
          setter(set) {
            console.log("nested setter before");
            set();
            console.log("nested setter after");
          },
        },
      })),
      [meta]: {
        postprocess() {
          console.log("someSlice postprocess");
        },
        setter(set) {
          console.log("someSlice setter before");
          set();
          console.log("someSlice setter after");
        },
      },
    })),
    [meta]: {
      postprocess() {
        console.log("root postprocess");
      },
      setter(set) {
        console.log("root setter before");
        set();
        console.log("root setter after");
      },
    },
  })
);

store.getState().someSlice.nested.test();
```

Console log would be the following:

```
test before

nested setter before
someSlice setter before
root setter before

nested postprocess
someSlice postprocess
root postprocess

root setter after
someSlice setter after
nested setter after

test after
```

## Misc

### `mergeDeep(a, b)`

### `mergeDeep(b)(a)`

Merges object `b` with `a` recursively (doesn't merge arrays).

### `mergeDeepLeft(a, b)`

Merges object `a` with `b` (note order). Useful with `persist` middleware.

### `persistOptions`

Helper for `persist` middleware. Can be used without lenses. First, you need to add these options to persist's config. Now you can attach options to any object in your state, just call `persistOptions` as function and provide an object with two optional functions: `save` and `load`. Whenever your state needs to be persisted, `save` function will be called and return value will be persisted. Similarly, `load` function will be called on hydration. This allows you to control, which data you want to save/restore. Both functions must be pure, don't mutate provided arguments.

```ts
const store = create(persist(() => ({
  // ... some state

  ...persistOptions({
    save(state) {
      // return an object that will be saved
    },

    load(persistedState) {
      // return an object that will be used as new state
    }
  })

  nested: {
    // ... some state

    // can be nested too
    ...persistOptions({
      save
      load
    })
  }
}), {
  name: 'my-store',
  // don't forget to add options to persist config
  ...persistOptions
}))
```

### `subscribe(store, selector, effect, options?)`

Alternative to [`subscribeWithSelector`](https://github.com/pmndrs/zustand#using-subscribe-with-selector) middleware.

<a id="watch"></a>

### `watch(selector, effect, options?)`

Similar to `subscribe` function, meant to be used in `setter` hook. It calls lens' `set` function first and then runs `effect` function if needed. Doesn't require to unsubscribe.

### `combineWatchers(...watchers)`

Runs watchers (or any setter-like functions) sequentially. Useful if you have multiple watchers. Example:

```ts
[meta]: {
  setter: combineWatchers(
    watch(state => state.id, handleIdChange),
    watch(state => state.name, handleNameChange)
  )
}
```
