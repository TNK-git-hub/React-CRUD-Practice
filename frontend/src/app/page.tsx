import { Suspense } from 'react'
import ProductList from '../views/ProductList'

// ProductList đọc ?q, ?page... bằng useSearchParams -> cần Suspense khi build
export default function Page() {
  return (
    <Suspense>
      <ProductList />
    </Suspense>
  )
}
