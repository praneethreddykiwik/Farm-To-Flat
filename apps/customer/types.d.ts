declare module '*.css';

// Metro turns a required image into an opaque asset reference that <Image source> accepts.
declare module '*.png' {
  const source: import('react-native').ImageSourcePropType;
  export = source;
}
