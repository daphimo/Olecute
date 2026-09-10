// Keep existing consumers on native document scrolling at every breakpoint.
const scrollContainerMediaQuery = matchMedia('(min-width: 990px)');
const getScrollContainer = () => document.scrollingElement || document.documentElement;
const getScrollTop = () => window.scrollY;
const getScrollEventTarget = () => document;
const getIntersectionRoot = () => null;
const scrollTo = (options) => window.scrollTo(options);
export { getScrollContainer, getScrollTop, getScrollEventTarget, getIntersectionRoot, scrollTo, scrollContainerMediaQuery };
