"use client";
import {useWatchlist} from './useWatchlist';
import type {WatchToken} from '@/lib/watchlist';
export default function FavoriteButton({token}:{token:WatchToken}){const {state,ready,toggle,error}=useWatchlist();const saved=state.entries.some(e=>e.mint===token.mint);return <div className="favorite-action"><button disabled={!ready||(!saved&&state.entries.length>=50)} aria-pressed={saved} onClick={()=>toggle(token)}>{saved?'★ Remove from Watchlist':'☆ Add to Watchlist'}</button>{error&&<small role="alert">{error}</small>}</div>;}
