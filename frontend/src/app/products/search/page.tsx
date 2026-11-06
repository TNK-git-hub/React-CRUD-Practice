import { Suspense } from 'react'
import ProductList from '../../../views/ProductList'

// cùng component với "/", có ?q thì URL là /products/search
export default function Page() {
  return (
    <Suspense>
      <ProductList />
    </Suspense>
  )
}
