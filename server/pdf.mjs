import pdfjs from 'pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js';
// Static import keeps the PDF engine and its worker in the cloud bundle.
export async function parsePDF(bytes){
 pdfjs.disableWorker=true;
 const document=await pdfjs.getDocument(new Uint8Array(bytes));
 try{
  if(document.numPages>400)throw new Error('Document exceeds 400-page parsing limit');
  const pages=[];
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
   const page=await document.getPage(pageNumber);const content=await page.getTextContent({normalizeWhitespace:false,disableCombineTextItems:false});let prior=null,text='';
   for(const item of content.items){if(prior!==null&&prior!==item.transform[5])text+='\n';text+=item.str;prior=item.transform[5];}
   pages.push({page:pageNumber,text});
  }
  return pages;
 }finally{await document.destroy();}
}
