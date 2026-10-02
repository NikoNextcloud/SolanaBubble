/** Public observations only; never apply these headers to personal or admin data. */
export const publicObservationHeaders=(seconds=120)=>({'cache-control':'public, max-age=30', 'vercel-cdn-cache-control':`public, s-maxage=${seconds}, stale-while-revalidate=30`});
