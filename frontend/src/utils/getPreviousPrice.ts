export default function getPreviousPrice(price: number, discountPercentage: number): string {
    return (price / (1 - discountPercentage / 100)).toFixed(2);
}