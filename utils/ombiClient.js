import axios from 'axios'

const {OMBI_URL, OMBI_APIKEY} = process.env

const OmbiClient = axios.create({
  baseURL: OMBI_URL,
  headers: {
    'ApiKey': OMBI_APIKEY
  }
})

export default OmbiClient
