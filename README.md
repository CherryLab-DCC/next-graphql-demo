# next-graphql-demo

An experiment for running a GraphQL server within Next.js.

The GraphQL schema is generated from the encodeD JSON Schemas.

## Notes

* Reverse references are modeled as Relay Connections while -to many forward references are modeled as GraphQL lists.
  Would it make more sense to make this distinction on the expected size of the referenced list?

* Superclasses should be modeled as interfaces rather than unions.
  Nit: naming conflicts for superclasses which are also concrete classes.

* Postgres' GIN index does not help with sorting.
  Querying a 1M resultset (all files) takes around 5 seconds.
  SQL pagination in database approximately doubles that.
  Filtering in DB with jsonpath may be the best option since it seems fast and avoids transferring 40MB from the database:

  ```sql
  select jsonb_path_query_array(jsonb_agg(id), '$[0 to 100]') from items where object @@ '$.__typename == "File"'; 
  ```

* How should non-visible forward references be handled?
  Maybe just assume nullable even if required? But then how to get url of that page?

# Running Docker

```sh
docker build . -t next-graphql-demo
docker run -p 3000:3000 -e "PGHOST=host.docker.internal" -e "PGDATABASE=$USER" -e "PGUSER=$USER" -it next-graphql-demo
```

# Creating a local database
At a psql prompt run


```sql
CREATE TABLE public.items (
    id uuid PRIMARY KEY,
    object jsonb NOT NULL,
    allowed jsonb NOT NULL,
    uniquekeys jsonb NOT NULL,
    links jsonb NOT NULL,
    audit jsonb NOT NULL
);

-- Load the data
\copy items from program 'zcat items.tsv.gz'

-- After data is loaded create the index
CREATE INDEX idx_items_gin ON items gin (object jsonb_path_ops, allowed jsonb_path_ops, uniquekeys jsonb_path_ops);
```

For faster queries run the following and restart postgres:
```sql
ALTER SYSTEM SET shared_buffers = '1024MB';
```
