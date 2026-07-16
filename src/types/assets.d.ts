// Raster image imports resolve to a Metro asset id (a number), same as `require('./x.webp')`.
declare module '*.webp' {
  const id: number;
  export default id;
}
declare module '*.png' {
  const id: number;
  export default id;
}
declare module '*.jpg' {
  const id: number;
  export default id;
}
