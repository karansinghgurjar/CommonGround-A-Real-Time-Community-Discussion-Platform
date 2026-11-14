import SkeletonThreadItem from "./skeletonThreadItem";


function skeletonList({ count = 6 }) {
    return (
        <div>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonThreadItem key={i} />
            ))}
        </div>
    );
}

export default skeletonList;