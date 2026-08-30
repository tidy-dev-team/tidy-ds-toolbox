/// <reference types="@figma/plugin-typings" />

export function addNewTextProperty(
  component: ComponentNode,
  textNode: TextNode,
  propName: string,
  propDefault: string,
) {
  component.addComponentProperty(propName, "TEXT", propDefault);
  const objName = Object.keys(component.componentPropertyDefinitions).find(
    (propertyName) => propertyName.startsWith(propName),
  );
  if (objName) {
    const references = JSON.parse(
      JSON.stringify(textNode.componentPropertyReferences),
    );
    references.characters = objName;
    textNode.componentPropertyReferences = references;
  }
}

export function addNewBooleanProperty(
  component: ComponentNode,
  node: SceneNode,
  propName: string,
  propDefault: boolean,
) {
  component.addComponentProperty(propName, "BOOLEAN", propDefault);
  const objName = Object.keys(component.componentPropertyDefinitions).find(
    (propertyName) => propertyName.startsWith(propName),
  );
  if (objName) {
    const references = JSON.parse(
      JSON.stringify(node.componentPropertyReferences),
    );
    references.visible = objName;
    node.componentPropertyReferences = references;
  }
}
