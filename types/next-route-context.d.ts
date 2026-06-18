type RouteParamName<Segment extends string> =
  Segment extends `[...${infer Param}]` ? Param :
  Segment extends `[[...${infer Param}]]` ? Param :
  Segment extends `[${infer Param}]` ? Param :
  never;

type RouteParamEntries<Path extends string> =
  Path extends `${infer Segment}/${infer Rest}`
    ? RouteParamName<Segment> | RouteParamEntries<Rest>
    : RouteParamName<Path>;

type RouteParams<Path extends string> = {
  [Param in RouteParamEntries<Path>]: string;
};

declare global {
  type RouteContext<Path extends string> = {
    params: Promise<RouteParams<Path>>;
  };
}

export {};
