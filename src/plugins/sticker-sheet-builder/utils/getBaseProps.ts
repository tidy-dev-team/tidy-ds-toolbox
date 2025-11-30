export function getBaseProps(
  typeProps: any[],
  stateProps: any[],
  otherProps: any[]
) {
  interface BaseProps {
    firstProp: any[] | null;
    secondProp: any[] | null;
    otherProps: any[] | null;
  }

  const baseProps: BaseProps = {
    firstProp: null,
    secondProp: null,
    otherProps: null,
  };

  if (!(typeProps.length || stateProps.length || otherProps.length))
    return null;

  if (typeProps.length && stateProps.length) {
    baseProps.firstProp = typeProps;
    baseProps.secondProp = stateProps;
    baseProps.otherProps = otherProps;
  } else if (stateProps.length) {
    baseProps.firstProp = otherProps.length ? otherProps[0] : null;
    baseProps.secondProp = stateProps;
    baseProps.otherProps = otherProps.slice(1) ?? null;
  } else if (typeProps.length) {
    baseProps.firstProp = typeProps;
    baseProps.secondProp = otherProps.length ? otherProps[0] : null;
    baseProps.otherProps = otherProps.slice(1) ?? null;
  } else if (otherProps.length) {
    baseProps.firstProp = otherProps[1] ?? null;
    baseProps.secondProp = otherProps[0];
    baseProps.otherProps = otherProps.slice(2) ?? null;
  }
  return baseProps;
}
