import {
  GraphQLObjectType,
  GraphQLUnionType,
  GraphQLString,
  GraphQLFloat,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  type GraphQLFieldConfig,
  type GraphQLFieldResolver,
  type GraphQLUnionTypeConfig,
  type GraphQLTypeResolver,
} from "graphql";
import { GraphQLJSON, GraphQLJSONObject } from "graphql-type-json";
import { type DB, type Json, type JsonObject } from "./DB";

export type Source = {
  __typename: string;
  [key: string]: Json;
};
export type Context = { db: DB<Source> };

type MappedTypes = {
  [key: string]: GraphQLObjectType<Source, Context> | GraphQLUnionType;
};
type SubTypes = { [key: string]: string[] };

function jsonpathIdent(s: string): string {
  return /^[_A-Za-z][_0-9A-Za-z]*$/.test(s) ? s : JSON.stringify(s);
}

function defaultLinkFromJsonPath(
  fromType: string,
  fromProperty: string
): string {
  return `$."@type"[*] == ${JSON.stringify(fromType)} && $.${jsonpathIdent(
    fromProperty
  )} == $uuid && $.status != "deleted" && $.status != "replaced"`;
}

const SCALAR_TYPE_MAP: { [key: string]: GraphQLScalarType } = {
  string: GraphQLString,
  float: GraphQLFloat,
  number: GraphQLFloat,
  integer: GraphQLInt,
  boolean: GraphQLBoolean,
  object: GraphQLJSONObject,
};

const resolveType: GraphQLTypeResolver<Source, Context> = (value) =>
  value.__typename;

function makeUnion(
  name: string,
  types: MappedTypes,
  st: string[]
): GraphQLObjectType<Source, Context> | GraphQLUnionType {
  let type = types[name];
  if (type) {
    return type;
  }
  type = new GraphQLUnionType({
    name,
    types: () => {
      const result: GraphQLObjectType<Source, Context>[] = [];
      for (const name of st) {
        const t = types[name];
        if (t instanceof GraphQLObjectType) {
          result.push(t);
        } else {
          throw new Error("Should be an object type");
        }
      }
      return result;
    },
    resolveType,
  } as GraphQLUnionTypeConfig<Source, Context>);
  types[name] = type;
  return type;
}

const resolveRef: GraphQLFieldResolver<Source, Context> = (
  obj,
  _,
  { db },
  { fieldName }
) => {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return undefined;
  }
  const uuid = obj[fieldName];
  if (typeof uuid !== "string") {
    return undefined;
  }
  return db.getByUUID(uuid);
};

const resolveRefList: GraphQLFieldResolver<Source, Context> = (
  obj,
  _,
  { db },
  { fieldName }
) => {
  const uuids = obj[fieldName];
  if (!Array.isArray(uuids)) {
    return undefined;
  }
  return uuids.map((uuid) =>
    typeof uuid === "string" ? db.getByUUID(uuid) : undefined
  );
};

function makeResolveJsonPath(
  jsonPath: string
): GraphQLFieldResolver<Source, Context> {
  return (obj, _, { db }) =>
    db
      .queryJsonPath(jsonPath, obj)
      .then((ids) => ids.map((id) => db.getByUUID(id)));
}

function normalizeLinkTo(
  types: MappedTypes,
  subtypes: SubTypes,
  linkTo: Json
): GraphQLObjectType<Source, Context> | GraphQLUnionType {
  const st = Array.from(
    new Set(
      (Array.isArray(linkTo) ? linkTo : [linkTo]).flatMap(
        (name) => subtypes[String(name)] ?? []
      )
    )
  ).sort();
  const name = st.join("__");
  return makeUnion(name, types, st);
}

function makeField(
  path: string[],
  schema: JsonObject,
  types: MappedTypes,
  subtypes: SubTypes,
  isRequired: boolean,
  isRenamed: boolean
): GraphQLFieldConfig<Source, Context> | void {
  const { description, items, linkTo } = schema;
  const originalName = path[path.length - 1]!;
  if (typeof description !== "string" && description !== undefined) {
    throw new Error("Bad description");
  }

  if (linkTo) {
    const inner = normalizeLinkTo(types, subtypes, linkTo);
    const type = isRequired ? new GraphQLNonNull(inner) : inner;
    return { type, description, resolve: resolveRef };
  }

  if (typeof items === "object" && items !== null && !Array.isArray(items)) {
    if (items["linkTo"]) {
      const inner = normalizeLinkTo(types, subtypes, items["linkTo"]);
      const list = new GraphQLList(new GraphQLNonNull(inner));
      const type = isRequired ? new GraphQLNonNull(list) : list;
      return { type, description, resolve: resolveRefList };
    }

    if (typeof items["linkFrom"] === "string") {
      const [fromType, fromProperty] = items["linkFrom"].split(".");
      if (typeof fromType !== "string" || typeof fromProperty !== "string") {
        throw new Error(`Malformed linkFrom: ${items["linkFrom"]}`);
      }
      const inner = types[fromType];
      if (inner === undefined) {
        throw new Error(`Unknown linkFrom: ${items["linkFrom"]}`);
      }
      const jsonPath =
        typeof items["linkFromJsonPath"] === "string"
          ? items["linkFromJsonPath"]
          : defaultLinkFromJsonPath(fromType, fromProperty);
      const type = new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(inner))
      );
      return { type, description, resolve: makeResolveJsonPath(jsonPath) };
    }
  }

  let type;
  if (typeof items === "object" && !Array.isArray(items) && items !== null) {
    const inner = makeField(path, items, types, subtypes, true, false);
    if (inner) {
      type = new GraphQLList(inner.type);
    }
  } else if (schema["properties"] && !schema["additionalProperties"]) {
    type = makeObject(path, schema, types, subtypes);
  } else if (Array.isArray(schema["type"])) {
    // all type: ['number', 'string'], mostly also pattern: '^Infinity$',
    console.warn({ reason: "type isArray", path, schema });
    type = GraphQLJSON;
  } else if (typeof schema["type"] === "string") {
    type = SCALAR_TYPE_MAP[schema["type"]];
  }
  if (type) {
    if (isRequired) {
      type = new GraphQLNonNull(type);
    }
    const resolve = isRenamed ? makeResolver(originalName) : undefined;
    return { type, description, resolve };
  }
  console.error({ reason: "no type", path, schema });
}

function makeResolver(originalName: string): (obj: Source) => Json | undefined {
  return (obj) => obj[originalName];
}

function normalizeName(name: string): string {
  let fieldName = name.replace("%", "pct").replace(/[^_a-zA-Z0-9]/g, "_");
  if (!fieldName.match(/^[_a-zA-Z]/)) {
    fieldName = "_" + fieldName;
  }
  return fieldName;
}

function makeObject(
  path: string[],
  schema: JsonObject,
  types: MappedTypes,
  subtypes: SubTypes
): GraphQLObjectType<Source, Context> | GraphQLUnionType {
  const { description, properties, required = [] } = schema;
  if (typeof description !== "string" && description !== undefined) {
    throw new Error("Bad description");
  }
  if (
    typeof properties !== "object" ||
    Array.isArray(properties) ||
    properties === null
  ) {
    throw new Error("Bad properties");
  }
  if (!Array.isArray(required)) {
    throw new Error("Bad required");
  }
  const name = path.map((name) => normalizeName(name)).join("__");
  let type = types[name];
  if (type) {
    return type;
  }
  //const interfaces = supertypes[name].slice(1);
  type = new GraphQLObjectType({
    name,
    description,
    //interfaces: () => interfaces.map(t => types[t]),
    fields: () =>
      Object.fromEntries(
        Object.entries(properties)
          .map(([k, subschema]) => {
            if (
              typeof subschema !== "object" ||
              Array.isArray(subschema) ||
              subschema === null
            ) {
              throw new Error("Bad subschema");
            }
            const fieldName = normalizeName(k);
            const isRequired = required.includes(k);
            const isRenamed = fieldName !== k;
            return [
              fieldName,
              makeField(
                [...path, k],
                subschema,
                types,
                subtypes,
                isRequired,
                isRenamed
              ),
            ];
          })
          .filter(([_k, v]) => v)
      ),
  });
  types[name] = type;
  return type;
}

export default function jsonSchemaToGraphQL(
  profiles: { [key: string]: JsonObject },
  subtypes: SubTypes
): MappedTypes {
  const types: MappedTypes = {};
  const supertypes: { [key: string]: string[] } = {};
  const abstract: string[] = [];
  for (const [child, childst] of Object.entries(subtypes)) {
    // only concrete subtypes included here.
    if (!profiles[child]) {
      abstract.push(child);
    }
    const parents = [];
    for (const [k, v] of Object.entries(subtypes)) {
      if (childst.every((t) => v.includes(t))) {
        parents.push(k);
      }
    }
    parents.sort((a, b) => {
      const asubb = (subtypes[a] ?? []).every((t) =>
        (subtypes[b] ?? []).includes(t)
      );
      const bsuba = (subtypes[b] ?? []).every((t) =>
        (subtypes[a] ?? []).includes(t)
      );
      if (asubb && !bsuba) {
        return -1;
      }
      if (bsuba && !asubb) {
        return 1;
      }
      return 0;
    });
    supertypes[child] = parents;
  }

  for (const name of abstract) {
    const st = subtypes[name] ?? [];
    makeUnion(name, types, st);
  }
  for (const [name, schema] of Object.entries(profiles)) {
    makeObject([name], schema, types, subtypes);
  }
  return types;
}
