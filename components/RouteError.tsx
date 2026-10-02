"use client";
export default function RouteError({reset}:{reset:()=>void}){return <div className="route-feedback" role="alert"><h2>Картата не може да се покаже</h2><p>Опитай отново. Записаните данни са запазени.</p><button onClick={reset}>Опитай отново</button><a href="/">Към Market Map</a></div>;}
