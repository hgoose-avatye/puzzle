/** Picture URLs by manifest folder + picture path (vite.config.ts spritePictures). */
declare module 'virtual:sprite-pictures' {
  const pictures: Record<string, string>;
  export default pictures;
}
