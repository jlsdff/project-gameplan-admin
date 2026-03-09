import { searchClient } from "@algolia/client-search";

const app_id = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID as string
const search_api_key = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY as string

const client = searchClient(app_id, search_api_key)

export default client;