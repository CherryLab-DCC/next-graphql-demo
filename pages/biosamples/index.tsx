import gql from "graphql-tag";
import Link from "next/link";
import graphqlServerSideProps from "@/lib/graphqlServerSideProps";
import BiosampleListItem from "@/components/BiosampleListItem";

const BiosampleListing = ({
  data: {
    results: { currentOffset, edges, pageInfo, totalCount },
  },
}) => {
  return (
    <div id="content" className="container Search">
      <div className="panel panel-default">
        <div className="panel-body">
          <div className="search-results">
            <div className="search-results__result-list">
              <h4>
                Showing {currentOffset + 1} to {currentOffset + edges.length} of{" "}
                {totalCount}
              </h4>
              <div className="results-table-control">
                <div className="results-table-control__main">
                  {pageInfo.hasPreviousPage && (
                    <Link href={`?before=${edges[0]?.cursor}`}>
                      <a rel="nofollow" className="btn btn-info btn-sm">
                        Previous
                      </a>
                    </Link>
                  )}
                  {pageInfo.hasNextPage && (
                    <Link href={`?after=${edges[edges.length - 1]?.cursor}`}>
                      <a rel="nofollow" className="btn btn-info btn-sm">
                        Next
                      </a>
                    </Link>
                  )}
                </div>
                {(pageInfo.hasPreviousPage || pageInfo.hasNextPage) && (
                  <div className="results-table-control__json">
                    <Link href="?all=true">
                      <a rel="nofollow" className="btn btn-info btn-sm">
                        View All
                      </a>
                    </Link>
                  </div>
                )}
              </div>

              <ul className="result-table" id="result-table">
                {edges.map(({ node }) => (
                  <li key={node._id} className="result-item__wrapper">
                    <BiosampleListItem result={node} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const getServerSideProps = graphqlServerSideProps(gql`
query BiosampleListingQuery($after: String, $before: String, $first: Int = 25, $last: Int = 25, $offset: Int, $all: Boolean) {
  results: queryJsonPath(
    path: ${JSON.stringify('$.__typename == "Biosample"')},
    orderBy: "accession",
    after: $after, before: $before, first: $first, last: $last, offset: $offset, all: $all
  ) {
    currentOffset
    edges {
      cursor
      node {
        ... on Biosample {
          _id
          ...BiosampleListItemFragment
        }
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
    }
    totalCount
  }
}
${BiosampleListItem.fragment}
`);

export default BiosampleListing;
