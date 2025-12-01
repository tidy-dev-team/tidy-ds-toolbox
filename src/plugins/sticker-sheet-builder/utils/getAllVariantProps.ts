export function getProps(componentProps: any) {
  const stateProps: any[] = [];
  const typeProps: any[] = [];
  const sizeProps: any[] = [];
  const binaryProps: any[] = [];
  const allOtherProps: any[] = [];

  const variantProps = componentProps.variant;
  const binaryOptions = ["true", "false", "on", "off"];
  const stateOptions = ["hover", "idle", "pressed"];
  const typeOptions = ["primary", "secondary"];
  //test

  for (const prop in variantProps) {
    const lowerProp = prop.toLowerCase();
    const variantOptions = variantProps[prop].variantOptions.map(
      (option: any) => option.toLowerCase(),
    );

    if (lowerProp === "size") {
      (sizeProps.push(prop), sizeProps.push(variantProps[prop]));
    } else if (
      variantOptions.length === 2 &&
      (binaryOptions.includes(variantOptions[0]) ||
        binaryOptions.includes(variantOptions[1]))
    ) {
      binaryProps.push([prop, variantProps[prop]]);
    } else if (lowerProp === "state") {
      (stateProps.push(prop), stateProps.push(variantProps[prop]));
    } else if (
      variantOptions.some((option: string) => stateOptions.includes(option))
    ) {
      (stateProps.push(prop), stateProps.push(variantProps[prop]));
    } else if (
      variantOptions.some((option: string) => typeOptions.includes(option))
    ) {
      (typeProps.push(prop), typeProps.push(variantProps[prop]));
    } else {
      allOtherProps.push([prop, variantProps[prop]]);
    }
  }
  return {
    stateProps,
    typeProps,
    sizeProps,
    binaryProps,
    allOtherProps,
  };
}
