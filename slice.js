// install plugins
Matter.use('matter-wrap', 'matter-attractors');

var Example = Example || {};

Example.slice = function () {
  // module aliases
  var Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Bodies = Matter.Bodies,
    Vertices = Matter.Vertices,
    Composite = Matter.Composite,
    Vector = Matter.Vector,
    Body = Matter.Body,
    Mouse = Matter.Mouse,
    MouseConstraint = Matter.MouseConstraint,
    Events = Matter.Events;

  // create an engine
  var engine = Engine.create();

  // create renderer
  var render = Render.create({
    element: document.body,
    engine: engine,
    options: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      wireframes: false
    }
  });

  // create runner
  var runner = Runner.create();

  Runner.run(runner, engine);
  Render.run(render);

  // initialize variables
  var world = engine.world;
  var startSlicePoint = null;
  var endSlicePoint = null;
  var isSlicing = false;

  // create mouse and mouseConstraint
  var mouse = Mouse.create(render.canvas);
  var mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.1,
      render: {
        visible: false
      }
    }
  });

  // add mouseConstraint to the world
  Composite.add(world, mouseConstraint);

  // Returns a PolyK polygon from a Matter.js body
  const getPolyFromBody = (body) => {
    let vertices = body.vertices.map(v => ({ x: v.x, y: v.y }));
    return [].concat.apply([], vertices.map(v => [v.x, v.y]));
  }

  // Returns a Matter.js body from a PolyK polygon
  const createBodyFromVertices = (vertices) => {
    // Calculate center of mass for the new shape
    var center = Vertices.centre(vertices);

    var newBody = Bodies.fromVertices(center.x, center.y, [vertices], {
      friction: 0.001,
      restitution: 0.5,
    });

    return newBody;
  }

  const partitionBody = (body, startSlicePoint, endSlicePoint) => {
    let newBodies = [];
    let polygon = getPolyFromBody(body);

    if (PolyK.IsSimple(polygon)) {
      var newPolygons = PolyK.Slice(polygon, startSlicePoint.x, startSlicePoint.y, endSlicePoint.x, endSlicePoint.y);

      if (newPolygons.length > 1) {
        // Create the new bodies
        newPolygons.forEach(function (newPolygon) {
          var newVertices = [];
          for (var j = 0; j < newPolygon.length; j += 2) {
            newVertices.push({ x: newPolygon[j], y: newPolygon[j + 1] });
          }

          var newBody = createBodyFromVertices(newVertices);
          newBodies.push(newBody);
        });
      }
    }

    return newBodies;
  }

  function performSlice() {
    var bodies = Composite.allBodies(world);
    for (let body of bodies) {
      let newBodies = partitionBody(body, startSlicePoint, endSlicePoint);

      if (newBodies.length <= 0) continue;

      // Store the velocity and angular velocity of the original body
      let originalVelocity = body.velocity;
      let originalAngularVelocity = body.angularVelocity;

      // Remove the original body from the world
      Composite.remove(world, body);

      for (let newBody of newBodies) {
        // change color to match original body
        newBody.render.fillStyle = body.render.fillStyle;
        
        // Set the velocity of the new bodies to the original body's velocity
        Body.setVelocity(newBody, originalVelocity);

        // Calculate the distance from the center of the original body to the center of the new body
        let distanceVector = Vector.sub(newBody.position, body.position);

        // Calculate the additional velocity due to the tangential velocity of the original body
        let tangentialVelocity = {
          x: -originalAngularVelocity * distanceVector.y,
          y: originalAngularVelocity * distanceVector.x
        };

        // Add the tangential velocity to the new body's velocity
        Body.setVelocity(newBody, Vector.add(newBody.velocity, tangentialVelocity));

        // Set the angular velocity of the new body
        Body.setAngularVelocity(newBody, originalAngularVelocity);

        // **** Simulate sliciing with a beveled edge ****
        let splitForce = 2; // acts as the knife's bevel angle/width
        let splitImpulse = Vector.mult(Vector.normalise(distanceVector), splitForce);
        Body.setVelocity(newBody, Vector.add(newBody.velocity, splitImpulse));

        // **** Simulate force transfer through the slice ****
        let sliceVector = Vector.sub(endSlicePoint, startSlicePoint);

        // clamp the magnitude of the slice vector to a reasonable value
        let maxSliceVectorMagnitude = 500;
        sliceVector = Vector.clampMagnitude(sliceVector, maxSliceVectorMagnitude);

        let sliceForceFactor = 0.00015;
        // the force should be proportional to the slice vector's magnitude and the new body's mass
        let sliceForceMagnitude = sliceForceFactor * Vector.magnitude(sliceVector) * newBody.mass;

        // the force should be applied in the direction of the slice
        let force = Vector.mult(Vector.normalise(sliceVector), sliceForceMagnitude);

        // weaken forces not pointing upwards using dot product
        let upwardVector = { x: 0, y: -1 };
        let upwardDotProduct = Vector.dot(Vector.normalise(force), upwardVector);
        upwardDotProduct = Math.max(upwardDotProduct, 0);
        force = Vector.mult(force, Math.abs(upwardDotProduct));

        // apply the force to the new body
        Body.applyForce(newBody, newBody.position, force);
      }

      // Add the new bodies to the world
      Composite.add(world, newBodies);
    }
  }

  // add mouse event listeners
  Events.on(mouseConstraint, 'mousedown', function (event) {
    // check if we're mousing down on a body or not
    var bodies = Composite.allBodies(world);
    for (let body of bodies) {
      if (Matter.Bounds.contains(body.bounds, mouse.position)) {
        // we're clicking on a body, so we should start dragging
        isDragging = true;
        return;
      }
    }

    // we're not clicking on a body, so we should start slicing
    isSlicing = true;

    // Disable the mouse constraint so we can move the slice points
    mouseConstraint.constraint.stiffness = 0.0;
    mouseConstraint.constraint.angularStiffness = 0.0;

    // Set the start slice point
    startSlicePoint = { x: event.mouse.position.x, y: event.mouse.position.y };

    // Reset the end slice point
    endSlicePoint = null;
  });

  Events.on(mouseConstraint, 'mousemove', function (event) {
    // if we are slicing, update the end slice point
    if (isSlicing) {
      endSlicePoint = { x: event.mouse.position.x, y: event.mouse.position.y };
    }
  });

  Events.on(mouseConstraint, 'mouseup', function (event) {
    if (isSlicing) {
      endSlicePoint = { x: event.mouse.position.x, y: event.mouse.position.y };
      // perform slicing here
      performSlice();

      // reset isSlicing and slice points
      isSlicing = false;
      startSlicePoint = null;
      endSlicePoint = null;
    }

    // whether we were dragging or slicing, the mouse is now up so we should stop dragging
    isDragging = false;

    // Reset the mouse constraint stiffness values
    mouseConstraint.constraint.stiffness = 0.1;
    mouseConstraint.constraint.angularStiffness = 0.2;
  });

  // create bodies
  let startingBodies = [];
  var boxA = Bodies.rectangle(400, 250, 80, 80);
  var boxB = Bodies.rectangle(500, 150, 80, 80);
  var ground = Bodies.rectangle(window.innerWidth / 2, window.innerHeight + 50, window.innerWidth, 200, { isStatic: true });
  var ceiling = Bodies.rectangle(window.innerWidth / 2, -50, window.innerWidth, 200, { isStatic: true });
  var wallLeft = Bodies.rectangle(-50, window.innerHeight / 2, 200, window.innerHeight, { isStatic: true });
  var wallRight = Bodies.rectangle(window.innerWidth + 50, window.innerHeight / 2, 200, window.innerHeight, { isStatic: true });

  startingBodies.push(boxA);
  startingBodies.push(boxB);
  startingBodies.push(ground);
  startingBodies.push(wallLeft);
  startingBodies.push(wallRight);
  startingBodies.push(ceiling);

  Composite.add(world, startingBodies);

  Events.on(render, 'afterRender', function () {
    // if we are slicing, draw the slice line
    if (isSlicing && startSlicePoint && endSlicePoint) {
      render.context.beginPath();
      render.context.moveTo(startSlicePoint.x, startSlicePoint.y);
      render.context.lineTo(endSlicePoint.x, endSlicePoint.y);
      render.context.lineWidth = 4;
      render.context.strokeStyle = '#df2f2f';
      render.context.stroke();
    }

    // update the world size to match the window inner size

    // update the render bounds
    render.bounds.max.x = window.innerWidth;
    render.bounds.max.y = window.innerHeight;

    // update the position of the bodies marking the bounds of the world
    // Body.setPosition(ground, {x: window.innerWidth / 2, y: window.innerHeight - 10});
    // Body.setPosition(wallLeft, {x: 0, y: window.innerHeight / 2});
    // Body.setPosition(wallRight, {x: window.innerWidth, y: window.innerHeight / 2});
    // Body.setPosition(ceiling, {x: window.innerWidth / 2, y: 0});
  });

  // return a context for MatterTools.Demo to control
  return {
    engine: engine,
    runner: runner,
    render: render,
    canvas: render.canvas,
    stop: function () {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
    }
  };
};