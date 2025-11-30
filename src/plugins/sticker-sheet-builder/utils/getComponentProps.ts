export function getComponentProps(
  mainComponent: ComponentNode | ComponentSetNode
) {
  const componentProps: {
    variant: Record<string, any>;
    boolean: Record<string, any>;
    text: Record<string, any>;
    instanceSwap: Record<string, any>;
  } = {
    variant: {},
    boolean: {},
    text: {},
    instanceSwap: {},
  };

  const props = mainComponent.componentPropertyDefinitions;
  for (const prop in props) {
    switch (props[prop].type) {
      case "VARIANT":
        componentProps.variant[prop] = props[prop];
        break;
      case "BOOLEAN":
        componentProps.boolean[prop] = props[prop];
        break;
      case "TEXT":
        componentProps.text[prop] = props[prop];
        break;
      case "INSTANCE_SWAP":
        componentProps.instanceSwap[prop] = props[prop];
        break;
      default:
        console.warn(`Unhandled property type: ${props[prop].type}`);
    }
  }
  return componentProps;
}
