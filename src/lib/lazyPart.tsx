import { lazy, Suspense, type ComponentProps, type ComponentType } from 'react';

/**
 * A component whose code downloads the first time it is shown, for dialogs and
 * panels most sessions never open. It renders nothing for the moment it takes to load.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPart<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  const Part = lazy(load);
  return function LazyPart(props: ComponentProps<T>) {
    return (
      <Suspense fallback={null}>
        <Part {...props} />
      </Suspense>
    );
  };
}
